(function(){
var C={"proxy":"{{PROXY}}","target":"{{TARGET}}","backend":"{{BACKEND}}"};
var PROXY=C.proxy,TARGET=C.target,BACKEND=C.backend;
function wrap(u){
try{u=new URL(u,document.baseURI||TARGET).href;}catch(e){return null;}
if(!/^https?:/i.test(u))return null;
if(u.indexOf(PROXY)===0)return null;
if(BACKEND&&u.indexOf(BACKEND)===0)return null;
// Video stream URLs — loaded directly by <video> elements (no CORS).
// Google binds these URLs to the client IP; proxying through our
// backend changes the request context and triggers 400 from Google.
if(u.indexOf(".googlevideo.com")!==-1)return null;
return PROXY+encodeURIComponent(u);}
var of=window.fetch;
if(typeof of==="function"){window.fetch=function(input,init){
try{var u=(typeof input==="string")?input:(input&&input.url)||"";
var w=wrap(u);
if(w){
// When mode is "no-cors", the browser forces GET for non-simple
// requests, destroying POST/PUT methods.  Strip it so the original
// method is preserved — our proxy handles CORS properly.
if(init&&init.mode==="no-cors"){
init=Object.assign({},init,{mode:"cors"});}
return of.call(this,w,init);}
}catch(e){}
return of.apply(this,arguments);};}
var oo=XMLHttpRequest.prototype.open;
XMLHttpRequest.prototype.open=function(m,u){
try{if(typeof u==="string"){var w=wrap(u);
if(w){var a=Array.prototype.slice.call(arguments);a[1]=w;
return oo.apply(this,a);}}}catch(e){}
return oo.apply(this,arguments);};
// Intercept window.open() for login/OAuth popups.
// Instead of opening a real popup (which breaks inside our proxy
// iframe), notify the parent frame so it can show a login modal.
var ow=window.open;
window.open=function(u){
try{var r=new URL(u,document.baseURI||TARGET).href;
if(window.parent&&window.parent!==window){
window.parent.postMessage({type:"lithium-popup",url:r},"*");
return null;}
}catch(e){}
return ow?ow.apply(this,arguments):null;};
// Also intercept clicks on target="_blank" links so login links
// open in the parent popup modal instead of a real browser popup.
document.addEventListener("click",function(e){
var a=e.target.closest?e.target.closest("a[target=_blank]"):null;
if(a){var h=a.getAttribute("href");
if(h&&/^https?:/i.test(h)){
e.preventDefault();
try{var r=new URL(h,document.baseURI||TARGET).href;
window.parent.postMessage({type:"lithium-popup",url:r},"*");
}catch(e2){}}}
},true);
// --- Login form detection + auto-fill ---
// Detect password fields and notify the parent frame so it can
// show a "Login with <email>?" bar.
function detectLogin(){
var pw=document.querySelector('input[type="password"]');
if(!pw)return;
// Find the email field: look for type=email, or name/id containing
// email/user/login, or the text input closest to the password field.
var em=document.querySelector('input[type="email"]');
if(!em){
var inputs=document.querySelectorAll('input[type="text"],input[type="tel"],input:not([type])');
for(var i=0;i<inputs.length;i++){
var n=(inputs[i].name||"")+"|"+(inputs[i].id||"")+"|"+(inputs[i].autocomplete||"");
if(/email|user|login|uid|account/i.test(n)){em=inputs[i];break;}
}
if(!em&&inputs.length)em=inputs[0];
}
if(em&&window.parent&&window.parent!==window){
window.parent.postMessage({type:"lithium-login-form",
hasEmail:!!em,hasPassword:true},"*");
}
}
// Run detection after DOM ready and on dynamic page changes
if(document.readyState==="loading"){
document.addEventListener("DOMContentLoaded",function(){detectLogin();});
}else{detectLogin();}
new MutationObserver(function(){setTimeout(detectLogin,300);})
.observe(document.documentElement,{childList:true,subtree:true});
// Listen for auto-fill commands from the parent frame
window.addEventListener("message",function(e){
var d=e.data;if(!d||d.type!=="lithium-autofill")return;
var pw=document.querySelector('input[type="password"]');
var em=document.querySelector('input[type="email"]');
if(!em){
var inputs=document.querySelectorAll('input[type="text"],input[type="tel"],input:not([type])');
for(var i=0;i<inputs.length;i++){
var n=(inputs[i].name||"")+"|"+(inputs[i].id||"")+"|"+(inputs[i].autocomplete||"");
if(/email|user|login|uid|account/i.test(n)){em=inputs[i];break;}
}
if(!em&&inputs.length)em=inputs[0];
}
if(em&&d.email){
// Use native input value setter to trigger React/Vue change handlers
var sv=Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,"value").set;
sv.call(em,d.email);
em.dispatchEvent(new Event("input",{bubbles:true}));
em.dispatchEvent(new Event("change",{bubbles:true}));
}
if(pw)pw.focus();
});
})();
