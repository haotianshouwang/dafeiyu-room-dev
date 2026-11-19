import {legalDocumentUrl} from '../community/legal-documents.js';

export const communityAuthCss = '.community-auth-switch{display:flex;gap:8px;margin:4px 0 18px;max-width:440px}.community-auth-switch button{flex:1}.community-auth-switch button[aria-selected=true]{font-weight:700;border-bottom:3px solid currentColor}.community-auth-consents{display:grid;gap:10px;border:0;padding:4px 0;margin:0}.community-auth-consents legend{padding:0 0 8px;color:inherit;font-size:12px}.community-auth-consents label{line-height:1.6}.community-auth-switch button:focus-visible,.community-form a:focus-visible{outline:3px solid #4e879f;outline-offset:3px}';

export function mountCommunityAuthForm({content,api,onAuthenticated,document = globalThis.document}) {
  const make = (tag,properties={},copy='') => {
    const element=document.createElement(tag);
    for(const [key,value] of Object.entries(properties)) {
      if(key.startsWith('aria-') || key==='role')element.setAttribute(key,String(value));
      else element[key]=value;
    }
    element.textContent=copy;
    return element;
  };
  const field = (input,copy) => {const label=make('label');label.append(make('span',{},copy),input);return label;};
  const tabs=make('div',{className:'community-auth-switch',role:'tablist','aria-label':'账号操作'});
  const loginTab=make('button',{type:'button',className:'btn',role:'tab'},'登录');
  const registerTab=make('button',{type:'button',className:'btn',role:'tab'},'注册');
  tabs.append(loginTab,registerTab);
  const form=make('form',{className:'community-form',noValidate:true});
  const note=make('p',{className:'community-note'},'不登录也可以继续单人游玩。');
  content.replaceChildren(tabs,form,note);
  let mode='login',busy=false,identifier,password,confirm,display,termsConsent,privacyConsent,status,submit,resend,pendingEmail='';
  const setStatus=(copy,input)=>{status.textContent=copy;status.focus({preventScroll:true});if(input){input.setAttribute('aria-invalid','true');input.focus();}};
  const errorMessage=error=>{
    if(error.code==='RATE_LIMITED')return '尝试次数过多，请稍后再试。';
    if(mode==='login' && error.status===401)return '邮箱、用户名或密码不正确。';
    if(mode==='register' && error.status===503)return '邮箱验证服务暂不可用，请稍后再试；你仍可继续单人游玩。';
    if(/too easy to guess/i.test(error.message))return '密码过于常见，请换一个更难猜的密码。';
    return error.message || '暂时无法完成，请稍后再试。';
  };
  function cooldown(until) {
    const button=resend;
    const update=()=>{
      if(!button.isConnected)return;
      const seconds=Math.max(0,Math.ceil((Number(until)-Date.now())/1000));
      button.disabled=seconds>0;
      button.textContent=seconds>0?'重新发送（'+seconds+' 秒）':'重新发送验证邮件';
      if(seconds>0)setTimeout(update,1000);
    };
    update();
  }
  function render(next) {
    if(busy)return;
    const email=identifier?.value.includes('@')?identifier.value:'';
    mode=next;pendingEmail='';
    const registering=mode==='register';
    loginTab.setAttribute('aria-selected',String(!registering));registerTab.setAttribute('aria-selected',String(registering));
    form.replaceChildren();
    identifier=make('input',{name:registering?'email':'identifier',type:registering?'email':'text',value:email,required:true,maxLength:254,autocomplete:registering?'email':'username',autocapitalize:'none',spellcheck:false});
    password=make('input',{name:'password',type:'password',required:true,minLength:8,maxLength:256,autocomplete:registering?'new-password':'current-password'});
    form.append(field(identifier,registering?'邮箱':'邮箱或用户名'),field(password,'密码（8–256 个字符）'));
    if(registering) {
      confirm=make('input',{name:'confirm_password',type:'password',required:true,minLength:8,maxLength:256,autocomplete:'new-password'});
      display=make('input',{name:'display_name',maxLength:80,autocomplete:'nickname',placeholder:'可留空，不会使用邮箱作为昵称'});
      form.append(field(confirm,'确认密码'),field(display,'显示名称（可选）'));
      const consents=make('fieldset',{className:'community-auth-consents'});
      consents.append(make('legend',{},'注册前请分别阅读并确认'));
      for(const [name,title] of [['terms','用户协议'],['privacy','隐私政策']]) {
        const input=make('input',{name:'accept_'+name,type:'checkbox',required:true});
        if(name==='terms')termsConsent=input;else privacyConsent=input;
        const label=make('label',{className:'community-check'});
        const copy=make('span',{},'我已阅读并同意 ');
        copy.append(make('a',{href:legalDocumentUrl(name,{baseUrl:api.baseUrl}),target:'_blank',rel:'noopener noreferrer'},'《'+title+'》'));
        label.append(input,copy);consents.append(label);
      }
      form.append(consents,make('p',{className:'community-note'},'邮箱验证后才会创建账号。邮箱不会公开展示给其他玩家。'));
    }
    status=make('p',{className:'community-status',role:'status','aria-live':'polite',tabIndex:-1});
    submit=make('button',{type:'submit',className:'btn primary'},registering?'发送验证邮件':'登录');
    const actions=make('div',{className:'community-actions'});actions.append(submit);
    form.append(status,actions);
    if(registering) {
      resend=make('button',{type:'button',className:'btn',hidden:true},'重新发送验证邮件');actions.append(resend);
      resend.onclick=async()=>{
        if(busy || resend.disabled || !pendingEmail)return;
        busy=true;resend.disabled=true;submit.disabled=true;loginTab.disabled=true;registerTab.disabled=true;
        try{
          const result=await api.resendVerification({email:pendingEmail});
          setStatus('如果该邮箱仍有待验证注册，新的邮件将发送；请检查收件箱和垃圾邮件。');
          cooldown(result.data.resend_after);
        }catch(error){setStatus(errorMessage(error));resend.disabled=false;}
        finally{busy=false;submit.disabled=false;loginTab.disabled=false;registerTab.disabled=false;}
      };
    }
  }
  loginTab.onclick=()=>render('login');registerTab.onclick=()=>render('register');
  form.onsubmit=async event=>{
    event.preventDefault();if(busy)return;
    const registering=mode==='register',email=identifier.value.trim();
    for(const input of form.querySelectorAll('input'))input.removeAttribute('aria-invalid');
    if(!email || (registering && !identifier.validity.valid))return setStatus(registering?'请输入有效的邮箱地址。':'请输入邮箱或用户名。',identifier);
    if(password.value.length<8 || password.value.length>256)return setStatus('密码长度需为 8–256 个字符。',password);
    if(registering && confirm.value!==password.value)return setStatus('两次输入的密码不一致。',confirm);
    if(registering && (!termsConsent.checked || !privacyConsent.checked))return setStatus('请分别阅读并同意用户协议和隐私政策。',!termsConsent.checked?termsConsent:privacyConsent);
    busy=true;submit.disabled=true;loginTab.disabled=true;registerTab.disabled=true;
    setStatus(registering?'正在申请邮箱验证…':'正在登录…');
    const payload={password:password.value,platform:'web',device_name:globalThis.navigator?.userAgent.slice(0,80)};
    try{
      if(registering) {
        const result=await api.register({...payload,email,display_name:display.value.trim() || undefined,accept_terms:true,accept_privacy:true});
        pendingEmail=email;password.value='';confirm.value='';resend.hidden=false;
        setStatus('如果该邮箱可以注册，验证邮件将发送到 '+result.data.email+'。请检查收件箱和垃圾邮件；已有账号可直接登录。');
        cooldown(result.data.resend_after);
      }else{
        const result=await api.login({...payload,identifier:email});password.value='';
        await onAuthenticated(result.data.user);
      }
    }catch(error){setStatus(errorMessage(error));}
    finally{busy=false;submit.disabled=false;loginTab.disabled=false;registerTab.disabled=false;}
  };
  render('login');
}
