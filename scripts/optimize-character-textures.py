"""Build a browser GLB without changing geometry, skinning or animation tracks.

Requires Pillow with WebP support. The source GLB remains untouched.
"""
import argparse
import hashlib
import gzip
import io
import json
import struct
from pathlib import Path

from PIL import Image


def optimize(source, destination):
    raw = source.read_bytes()
    json_size = struct.unpack_from('<I', raw, 12)[0]
    document = json.loads(raw[20:20 + json_size])
    binary_offset = 20 + json_size + 8
    binary = raw[binary_offset:]
    replacements = {}
    images = []
    for image in document.get('images', []):
        view = document['bufferViews'][image['bufferView']]
        start = view.get('byteOffset', 0)
        picture = Image.open(io.BytesIO(binary[start:start + view['byteLength']]))
        original_size = picture.size
        picture.thumbnail((2048, 2048), Image.Resampling.LANCZOS)
        output = io.BytesIO()
        picture.save(output, 'WEBP', quality=95, method=6)
        replacements[image['bufferView']] = output.getvalue()
        image['mimeType'] = 'image/webp'
        images.append({'original': original_size, 'web': picture.size, 'bytes': output.tell()})
    for texture in document.get('textures', []):
        if 'source' in texture:
            texture.setdefault('extensions', {})['EXT_texture_webp'] = {'source': texture.pop('source')}
    for key in ['extensionsUsed', 'extensionsRequired']:
        document.setdefault(key, [])
        if 'EXT_texture_webp' not in document[key]:
            document[key].append('EXT_texture_webp')
    chunks = []
    offset = 0
    for index, view in enumerate(document['bufferViews']):
        if view.get('buffer', 0) != 0:
            raise ValueError('Only embedded single-buffer GLBs are supported')
        start = view.get('byteOffset', 0)
        content = replacements.get(index, binary[start:start + view['byteLength']])
        view['byteOffset'] = offset
        view['byteLength'] = len(content)
        padded = content + b'\0' * (-len(content) % 4)
        chunks.append(padded)
        offset += len(padded)
    document['buffers'][0]['byteLength'] = offset
    metadata = json.dumps(document, ensure_ascii=False, separators=(',', ':')).encode('utf-8')
    metadata += b' ' * (-len(metadata) % 4)
    packed = b''.join(chunks)
    result = struct.pack('<III', 0x46546C67, 2, 12 + 8 + len(metadata) + 8 + len(packed))
    result += struct.pack('<II', len(metadata), 0x4E4F534A) + metadata
    result += struct.pack('<II', len(packed), 0x004E4942) + packed
    destination.write_bytes(result)
    destination.with_suffix('.glb.gz').write_bytes(gzip.compress(result, compresslevel=6, mtime=0))
    print(json.dumps({'source_bytes': len(raw), 'web_bytes': len(result), 'animations': len(document.get('animations', [])), 'images': images, 'sha256': hashlib.sha256(result).hexdigest()}))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source', type=Path)
    parser.add_argument('destination', type=Path)
    args = parser.parse_args()
    optimize(args.source, args.destination)
