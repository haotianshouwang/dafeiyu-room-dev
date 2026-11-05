// Catalog images are static previews. Browsing never acquires a 3D asset lease.
export function appendCatalogPreview(button,meta){
 const doc=button.ownerDocument,preview=doc.createElement(meta.thumbnailURL?'img':'span');
 if(meta.thumbnailURL){
  preview.className='catalog-preview';preview.width=preview.height=88;
  preview.alt='';preview.loading='lazy';preview.decoding='async';preview.src=meta.thumbnailURL;
  preview.onerror=()=>{const fallback=doc.createElement('span');fallback.className='catalog-preview catalog-missing';fallback.textContent='图片暂缺';preview.replaceWith(fallback);};
 }else{preview.className=meta.local?'catalog-preview catalog-missing':'catalog-icon';preview.textContent=meta.local?'图片暂缺':meta.icon;}
 const label=doc.createElement('span');label.className='catalog-label';label.textContent=meta.label;
 button.append(preview,label);
}
