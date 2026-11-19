import {legalDocumentUrl} from './legal-documents.js';

const styles = `
.community-auth-gate{position:fixed;inset:0;z-index:180;display:grid;place-items:center;padding:20px;background:radial-gradient(circle at 18% 12%,#195465 0,transparent 34rem),linear-gradient(145deg,#071c28,#031019 76%);color:#f0f5ee;font:14px/1.55 "Microsoft YaHei UI","Source Han Sans SC",sans-serif;box-sizing:border-box}
.community-auth-gate *{box-sizing:border-box}.community-auth-card{width:min(470px,100%);padding:clamp(24px,5vw,42px);border:1px solid #add8cc3d;border-radius:5px 30px 5px 5px;background:#061821e8;box-shadow:0 32px 100px #0008;outline:none}.community-auth-brand{display:flex;align-items:center;gap:11px;color:#74b89b;font-size:12px;font-weight:750;letter-spacing:.15em}.community-auth-brand:before{content:"";width:30px;height:4px;border-radius:99px;background:#74b89b;box-shadow:0 7px 0 #74b89b99,0 14px 0 #74b89b55}.community-auth-card h1{margin:20px 0 8px;font-size:clamp(27px,5vw,38px);line-height:1.1;letter-spacing:-.045em}.community-auth-card>p{margin:0;color:#9eb5b4;font-size:13px;line-height:1.75}.community-auth-tabs{display:grid;grid-template-columns:1fr 1fr;margin:24px 0 20px;border-bottom:1px solid #d9eee638}.community-auth-tab{border:0;border-bottom:2px solid transparent;padding:12px 7px;background:none;color:#8fa8a5;font:inherit;cursor:pointer}.community-auth-tab[aria-selected=true]{border-bottom-color:#e77b68;color:#f0f5ee;font-weight:750}.community-auth-form{display:grid;gap:14px}.community-auth-form label{display:grid;gap:6px;color:#d8e4df;font-size:12px;font-weight:650}.community-auth-form label small{color:#809b98;font-size:11px;font-weight:400}.community-auth-form input:not([type=checkbox]){width:100%;min-height:46px;border:1px solid #accdc34a;border-radius:4px 16px 4px 4px;padding:10px 12px;background:#071d27;color:#f0f5ee;font:inherit;outline:none}.community-auth-form input:not([type=checkbox]):focus-visible{border-color:#74b89b;box-shadow:0 0 0 3px #74b89b30}.community-auth-form input[aria-invalid=true]{border-color:#e77b68}.community-auth-check{display:flex!important;grid-template-columns:auto 1fr;align-items:center;justify-content:start;gap:8px!important;color:#9eb5b4!important;font-weight:400!important}.community-auth-check input{accent-color:#74b89b}.community-auth-actions{display:flex;gap:9px;margin-top:2px}.community-auth-actions button{width:100%;min-height:48px;display:flex;align-items:center;justify-content:space-between;border:1px solid #74b89b;border-radius:4px 16px 4px 4px;padding:11px 16px;background:#74b89b;color:#062026;font:inherit;font-weight:780;cursor:pointer}.community-auth-actions button:focus-visible,.community-auth-tab:focus-visible{outline:3px solid #e7d5b3;outline-offset:3px}.community-auth-actions button:disabled{opacity:.55;cursor:wait}.community-auth-status{min-height:22px;color:#e8ac9d;font-size:12px;line-height:1.55;outline:none}.community-auth-note{font-size:11px;color:#78918f;line-height:1.65}.community-auth-card [hidden]{display:none!important}@media(prefers-reduced-motion:reduce){.community-auth-gate *{animation:none!important;transition:none!important}}
`;
const legalStyles = `
.community-auth-gate{overflow:auto;align-items:safe center}
.community-auth-card{max-height:calc(100dvh - 40px);overflow:auto;overscroll-behavior:contain}
.community-auth-legal{display:grid;gap:7px;margin:0;border:1px solid #accdc32e;border-radius:4px 16px 4px 4px;padding:12px 13px;color:#9eb5b4}
.community-auth-legal legend{padding:0 5px;color:#809b98;font-size:11px}
.community-auth-legal .community-auth-check{align-items:flex-start;line-height:1.55}
.community-auth-legal input{margin-top:2px}
.community-auth-legal a{color:#8ec9ac;text-underline-offset:3px}
.community-auth-resend{width:100%;min-height:42px;border:1px solid #accdc34a;border-radius:4px 14px 4px 4px;padding:9px 12px;background:transparent;color:#b7ccc6;font:inherit;cursor:pointer}
.community-auth-resend:focus-visible{outline:3px solid #e7d5b3;outline-offset:3px}
.community-auth-resend:disabled{opacity:.55;cursor:wait}
`;

function element(tag, attributes = {}, text = '') {
  const node = document.createElement(tag);
  Object.assign(node, attributes);
  if (text) node.textContent = text;
  return node;
}

function labelled(control,label,hint) {
  const row = element('label');
  row.append(element('span', {}, label), control);
  if (hint) row.append(element('small', {}, hint));
  return row;
}

function legalUrl(api, path) {
  return legalDocumentUrl(path.slice(1), {baseUrl:api.baseUrl});
}

export async function ensureCommunityLogin(api, { document = globalThis.document } = {}) {
  try {
    return (await api.me()).data.user;
  } catch (error) {
    if (error.status !== 401) throw error;
  }

  let mode = 'login';
  let pendingEmail = '';
  const style = element('style');
  style.textContent = styles + legalStyles;
  const gate = element('div', { className:'community-auth-gate' });
  const card = element('section', { className:'community-auth-card', role:'dialog', 'aria-modal':'true', 'aria-labelledby':'community-auth-title', tabindex:'-1' });
  const tabs = element('div', { className:'community-auth-tabs', role:'tablist', 'aria-label':'账号操作' });
  const loginTab = element('button', { className:'community-auth-tab', type:'button', role:'tab', 'aria-selected':'true' }, '登录');
  const registerTab = element('button', { className:'community-auth-tab', type:'button', role:'tab', 'aria-selected':'false' }, '注册');
  const identifier = element('input', { name:'identifier', required:true, autocomplete:'username', maxlength:'254', autocapitalize:'none', spellcheck:false });
  const display = element('input', { name:'display_name', autocomplete:'nickname', maxlength:'80' });
  const password = element('input', { name:'password', required:true, type:'password', autocomplete:'current-password', minlength:'8', maxlength:'256' });
  const confirm = element('input', { name:'confirm_password', type:'password', autocomplete:'new-password', minlength:'8', maxlength:'256' });
  const identifierField = labelled(identifier,'邮箱或用户名','已有账号可输入注册邮箱或旧用户名');
  const displayLabel = labelled(display,'显示名称','其他玩家看到的名称，可留空');
  const confirmLabel = labelled(confirm,'确认密码');
  displayLabel.hidden = true;
  confirmLabel.hidden = true;
  const show = element('input', { type:'checkbox' });
  const showLabel = element('label', { className:'community-auth-check' });
  showLabel.append(show,element('span', {}, '显示密码'));
  const legalConsent = element('input', { type:'checkbox' });
  const legalLabel = element('label', { className:'community-auth-check' });
  const legalText = element('span');
  legalText.append('我已阅读并同意 ');
  const termsLink = element('a', { href:legalUrl(api,'/terms'), target:'_blank', rel:'noopener noreferrer' }, '《用户协议》');
  const privacyLink = element('a', { href:legalUrl(api,'/privacy'), target:'_blank', rel:'noopener noreferrer' }, '《隐私政策》');
  legalText.append(termsLink, ' 和 ', privacyLink);
  legalLabel.append(legalConsent,legalText);
  const legalField = element('fieldset', { className:'community-auth-legal' });
  legalField.append(element('legend', {}, '注册前请阅读并确认'),legalLabel);
  legalField.hidden = true;
  const resendVerification = element('button', { type:'button', className:'community-auth-resend' }, '重新发送验证邮件');
  resendVerification.hidden = true;
  const status = element('p', { className:'community-auth-status', role:'alert', 'aria-live':'polite', tabindex:'-1' });
  const submit = element('button', { type:'submit' });
  submit.append(element('span', { id:'community-auth-submit-label' }, '登录并进入'),element('span', { 'aria-hidden':'true' }, '→'));
  const form = element('form', { className:'community-auth-form', noValidate:true });
  form.append(
    identifierField,
    displayLabel,
    labelled(password,'密码','至少 8 个字符'),
    confirmLabel,
    showLabel,
    legalField,
    resendVerification,
    status,
    submit
  );
  const actions = element('div', { className:'community-auth-actions' });
  actions.append(submit);
  form.append(actions);
  tabs.append(loginTab,registerTab);
  card.append(
    element('div', { className:'community-auth-brand' }, '大肥鱼社区'),
    element('h1', { id:'community-auth-title' }, '登录后进入游戏'),
    element('p', {}, '新玩家使用邮箱注册；已有账号可使用注册邮箱或旧用户名登录。登录凭证保存在 Cookie 中，不写入 localStorage。'),
    tabs,
    form,
    element('p', { className:'community-auth-note' }, '本地桌面版仍支持不注册账号的游客模式。')
  );
  gate.append(card);
  document.head.append(style);
  document.body.append(gate);
  card.focus();

  function setStatus(message = '', field = null) {
    status.textContent = message;
    for (const input of [identifier,display,password,confirm,legalConsent]) input.removeAttribute('aria-invalid');
    field?.setAttribute?.('aria-invalid','true');
    if (message) status.focus({ preventScroll:true });
  }

  function setMode(next) {
    if (submit.disabled) return;
    mode = next;
    const register = next === 'register';
    loginTab.setAttribute('aria-selected',String(!register));
    registerTab.setAttribute('aria-selected',String(register));
    displayLabel.hidden = !register;
    confirmLabel.hidden = !register;
    legalField.hidden = !register;
    resendVerification.hidden = true;
    pendingEmail = '';
    confirm.required = register;
    legalConsent.required = register;
    identifier.type = register ? 'email' : 'text';
    identifier.name = register ? 'email' : 'identifier';
    identifier.autocomplete = register ? 'email' : 'username';
    identifierField.querySelector('span').textContent = register ? '邮箱' : '邮箱或用户名';
    identifierField.querySelector('small').textContent = register ? '邮箱将作为新账号的登录凭据' : '已有账号可输入注册邮箱或旧用户名';
    card.querySelector('h1').textContent = register ? '创建你的社区邮箱账号' : '登录后进入游戏';
    password.autocomplete = register ? 'new-password' : 'current-password';
    document.querySelector('#community-auth-submit-label').textContent = register ? '发送验证邮件' : '登录并进入';
    setStatus('');
    identifier.focus({ preventScroll:true });
  }

  function validate() {
    const accountId = identifier.value.trim();
    if (mode === 'register') {
      if (accountId.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountId)) {
        setStatus('请输入有效的邮箱地址。',identifier);
        return null;
      }
      if (!legalConsent.checked) {
        setStatus('请阅读并同意用户协议和隐私政策。',legalConsent);
        return null;
      }
    } else if (!accountId) {
      setStatus('请输入邮箱或用户名。',identifier);
      return null;
    }
    if (password.value.length < 8 || password.value.length > 256) {
      setStatus('密码长度需为 8–256 个字符。',password);
      return null;
    }
    if (mode === 'register' && password.value !== confirm.value) {
      setStatus('两次输入的密码不一致。',confirm);
      return null;
    }
    return {
      ...(mode === 'register'
        ? {email:accountId,accept_terms:legalConsent.checked,accept_privacy:legalConsent.checked}
        : {identifier:accountId}),
      password:password.value,
      platform:'web',
      device_name:navigator.userAgent.slice(0,120),
      ...(mode === 'register' && display.value.trim() ? { display_name:display.value.trim() } : {})
    };
  }

  loginTab.onclick = () => setMode('login');
  registerTab.onclick = () => setMode('register');
  show.onchange = () => {
    const type = show.checked ? 'text' : 'password';
    password.type = type;
    confirm.type = type;
  };
  resendVerification.onclick = async () => {
    if (!pendingEmail || resendVerification.disabled) return;
    resendVerification.disabled = true;
    setStatus('正在重新发送验证邮件…');
    try {
      await api.resendVerification({email:pendingEmail});
      setStatus('如果该邮箱仍有待验证注册，新的验证邮件已发送，请检查收件箱和垃圾邮件。');
    } catch (error) {
      setStatus(error.message || '验证邮件发送失败，请稍后重试。');
    } finally {
      resendVerification.disabled = false;
    }
  };

  return new Promise(resolve => {
    form.onsubmit = async event => {
      event.preventDefault();
      const payload = validate();
      if (!payload || submit.disabled) return;
      submit.disabled = true;
      setStatus(mode === 'register' ? '正在发送验证邮件…' : '正在验证账号…');
      try {
        const result = mode === 'register' ? await api.register(payload) : await api.login(payload);
        if (mode === 'register' && result.data.verification_required) {
          pendingEmail = payload.email;
          password.value = ''; confirm.value = '';
          resendVerification.hidden = false;
          setStatus(`如果该邮箱可以注册，验证邮件将发送到 ${result.data.email}；请检查收件箱或垃圾邮件，已有账号可直接登录。`);
          return;
        }
        gate.remove();
        style.remove();
        resolve(result.data.user);
      } catch (error) {
        if (error.code === 'RATE_LIMITED') setStatus('尝试次数过多，请稍后再试。');
        else if (error.status === 401) setStatus('邮箱、用户名或密码不正确。',password);
        else if (/too easy to guess/i.test(error.message)) setStatus('密码过于常见，或包含了用户名，请换一个更难猜测的密码。',password);
        else if (/Email is already registered/i.test(error.message) || error.code === 'EMAIL_ALREADY_REGISTERED') setStatus('该邮箱已注册，请直接登录或使用其他邮箱。',identifier);
        else if (/Username is unavailable/i.test(error.message)) setStatus('用户名已被使用，请换一个。',identifier);
        else setStatus(error.message || '暂时无法完成，请稍后重试。');
      } finally {
        submit.disabled = false;
      }
    };
  });
}
