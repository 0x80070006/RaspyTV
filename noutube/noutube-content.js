"use strict";(()=>{var wt="0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ",Uo=(e=8)=>{let t="";for(let n=0;n<e;n+=1)t+=wt[Math.floor(Math.random()*wt.length)];return t},D=()=>({schemaVersion:1,channels:[],keywords:[]}),Ie=e=>e.trim().replace(/^https?:\/\/(www\.|m\.)?youtube\.com\//i,"").replace(/^\/+/,"").replace(/^(c|channel|user)\//i,"").replace(/^\/+/,"").replace(/^@+/,"").replace(/\s+/g," ").toLocaleLowerCase(),zo=(e,t)=>{if(!e)return!1;let n=Ie(e);return n?kt(t).some(o=>n===o):!1},oe=(e,t)=>e.some(n=>zo(n,t)),St=(e,t)=>{let n=Ie(e);return n?{id:typeof t?.id=="string"&&t.id?t.id:Uo(),value:n,enabled:typeof t?.enabled=="boolean"?t.enabled:!0,createdAt:typeof t?.createdAt=="number"?t.createdAt:Date.now()}:null},xt=e=>{let t=new Set,n=[];for(let o of e||[]){let r=typeof o=="string"?St(o):St(o.value||"",o);!r||t.has(r.value)||(t.add(r.value),n.push(r))}return n},_t=e=>({schemaVersion:1,channels:xt(e?.channels),keywords:xt(e?.keywords)});var kt=e=>e.filter(t=>t.enabled).map(t=>t.value),Ne=(e,t)=>{if(!e)return!1;let n=Ie(e);return n?kt(t).some(o=>n.includes(o)):!1},re=(e,t)=>e.some(n=>Ne(n,t));var Do=["adBreakHeartbeatParams","adPlacements","adSlots","playerAds"],$e=new RegExp("^/youtubei/v1/(browse|get_watch|next|player|search)"),qe=e=>e.blockAds!==!1;function Oe(e,t={}){let n=JSON.parse(e);return qe(t)&&Tt(n[0].playerResponse),Bt(n[0].playerResponse,t),ie(n,t),JSON.stringify(n)}function Tt(e){return Do.forEach(t=>delete e[t]),e}function Ve(e,t,n={}){let o=JSON.parse(e);return qe(n)&&Tt(o),Bt(o,n),ie(o,n),JSON.stringify(o)}function Ue(e,t,n={}){let o=JSON.parse(e),r=n.hideShorts!==!1;ie(o,n);let s=(o.contents?.sectionListRenderer||o.contents?.twoColumnSearchResultsRenderer?.primaryContents.sectionListRenderer)?.contents[0].itemSectionRenderer||o.onResponseReceivedCommands?.[0].appendContinuationItemsAction?.continuationItems?.[0].itemSectionRenderer;return s&&(s.contents=s.contents.map(a=>jo(a,t,r)).filter(Boolean)),N(o,t,n),JSON.stringify(o)}function F(e,t,n={}){let o=JSON.parse(e);return ie(o,n),N(o,t,n),JSON.stringify(o)}function jo(e,t,n){let{videoWithContextRenderer:o,gridShelfViewModel:r}=e;if(!(n&&(r||o?.navigationEndpoint.commandMetadata.webCommandMetadata.url.startsWith("/shorts")))&&!Lt(e,t))return e}function N(e,t,n={}){if(!e||typeof e!="object")return;let o=qe(n);for(let r of Object.keys(e)){let i=e[r];Array.isArray(i)?(e[r]=i.filter(s=>!(o&&Wo(s))&&!Lt(s,t)),e[r].forEach(s=>N(s,t,n))):i&&typeof i=="object"&&N(i,t,n)}}var Fo=["adSlotRenderer","adsEngagementPanelRenderer","bannerPromoRenderer","brandVideoShelfRenderer","brandVideoSingletonRenderer","carouselAdRenderer","compactPromotedItemRenderer","compactPromotedVideoRenderer","displayAdRenderer","inFeedAdLayoutRenderer","mealbarPromoRenderer","primetimePromoRenderer","promotedSparklesTextSearchRenderer","promotedSparklesWebRenderer","promotedVideoRenderer","searchPyvRenderer","statementBannerRenderer"];function Wo(e){return!e||typeof e!="object"?!1:[e,e.richItemRenderer?.content,e.richSectionRenderer?.content,e.itemSectionRenderer?.contents?.length===1?e.itemSectionRenderer.contents[0]:void 0].filter(Boolean).some(n=>Fo.some(o=>n[o]))}function Lt(e,t){let n=_t(t);return!n.channels.length&&!n.keywords.length?!1:Ct(e).some(o=>Qo(o,n))}function Ct(e){if(!e||typeof e!="object")return[];let t=[e.videoRenderer,e.compactVideoRenderer,e.gridVideoRenderer,e.videoWithContextRenderer,e.reelItemRenderer,e.lockupViewModel,e.richItemRenderer?.content?.videoRenderer,e.richItemRenderer?.content?.lockupViewModel].filter(Boolean);return t.length?t:[]}function Qo(e,t){let n=Yo(e),o=Ko(e);return re(n,t.keywords)||oe(o,t.channels)}function Yo(e){return[L(e?.title),L(e?.headline),e?.metadata?.lockupMetadataViewModel?.title?.content].filter(Boolean)}function Mt(e,t={ids:new Set,urls:new Set,names:new Set}){if(!e||typeof e!="object")return t;if(e.browseEndpoint){let{browseId:n,canonicalBaseUrl:o}=e.browseEndpoint;typeof n=="string"&&n&&t.ids.add(n),typeof o=="string"&&o&&t.urls.add(o)}typeof e.text=="string"&&e.text&&e.navigationEndpoint?.browseEndpoint&&t.names.add(e.text);for(let n of Object.keys(e))Mt(e[n],t);return t}function Ko(e){let t=Mt(e),n=[...t.names,...t.urls,...t.ids];return n.length===0?[L(e?.ownerText),L(e?.shortBylineText),L(e?.longBylineText),L(e?.owner?.videoOwnerRenderer?.title),e?.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl,e?.shortBylineText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,e?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.canonicalBaseUrl,e?.ownerText?.runs?.[0]?.navigationEndpoint?.browseEndpoint?.browseId,e?.metadata?.lockupMetadataViewModel?.metadata?.content,e?.contentMetadata?.runs?.map(o=>o?.text).join(" ")].filter(Boolean):n}function L(e){return e?typeof e=="string"?e:typeof e.simpleText=="string"?e.simpleText:typeof e.content=="string"?e.content:Array.isArray(e.runs)?e.runs.map(t=>t?.text||"").join(""):"":""}function Bt(e,t){if(!t.showOriginalVideoTitle)return;let n=L(e?.videoDetails?.title);n&&(j(e?.microformat?.playerMicroformatRenderer?.title,n),j(e?.videoDetails?.title,n))}function ie(e,t){!t.showOriginalVideoTitle||!e||typeof e!="object"||He(e,n=>{for(let o of Ct(n))Et(o);Et(n)})}function He(e,t){if(!(!e||typeof e!="object")){if(t(e),Array.isArray(e)){e.forEach(n=>He(n,t));return}for(let n of Object.keys(e))He(e[n],t)}}function Et(e){if(!e||typeof e!="object")return;let t=Jo(e);t&&(j(e.title,t),j(e.headline,t),j(e.metadata?.lockupMetadataViewModel?.title,t))}function Jo(e){return[e.originalTitle,e.untranslatedTitle,e.untranslatedVideoTitle,e.title?.originalTitle,e.title?.untranslatedTitle,e.headline?.originalTitle,e.metadata?.lockupMetadataViewModel?.originalTitle,e.metadata?.lockupMetadataViewModel?.title?.originalTitle].map(L).find(Boolean)||""}function j(e,t){!e||typeof e!="object"||(typeof e.simpleText=="string"&&(e.simpleText=t),typeof e.content=="string"&&(e.content=t),Array.isArray(e.runs)&&e.runs.length&&e.runs.forEach((n,o)=>{n&&typeof n=="object"&&typeof n.text=="string"&&(n.text=o===0?t:"")}))}var Go=()=>window.NouTube?.getSettings?.()?.blockAds!==!1;function Pt(){let e=window.ytInitialData;Object.defineProperty(window,"ytInitialData",{get(){return e},set(o){try{let r=window.NouTube?.getBlocklist?.();N(o,r,{blockAds:Go()})}catch(r){console.error("NouScript initialData:",r)}e=o},configurable:!0});let t=fetch;window.fetch=async(...o)=>{let r=o[0],i=r instanceof Request?r.url:r.toString(),s=await t(...o),a=new URL(i).pathname.match($e),l=window.NouTube?.getBlocklist?.(),p=window.NouTube?.getSettings?.(),d={showOriginalVideoTitle:!!p?.showOriginalVideoTitle,blockAds:p?.blockAds!==!1};if(s.status>200||!a)return s;let u=await s.text(),c={status:s.status,headers:s.headers};try{let m={browse:(f,h)=>F(f,h,d),get_watch:f=>Oe(f,d),next:(f,h)=>F(f,h,d),search:(f,h)=>Ue(f,l,{hideShorts:window.NouTube.shortsHidden,...d})}[a[1]]||((f,h)=>Ve(f,h,d));return new Response(m(u,l),c)}catch(m){console.error("NouScript:",m)}return new Response(u,c)};let n=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(o,r){return r=r.toString(),this.addEventListener("readystatechange",function(){if(this.readyState!==4)return;let i=new URL(r,location.origin).pathname.match($e);if(!i)return;let s=window.NouTube?.getBlocklist?.(),a=window.NouTube?.getSettings?.(),l={showOriginalVideoTitle:!!a?.showOriginalVideoTitle,blockAds:a?.blockAds!==!1};try{let d=({browse:(u,c)=>F(u,c,l),get_watch:u=>Oe(u,l),next:(u,c)=>F(u,c,l),search:(u,c)=>Ue(u,s,{hideShorts:window.NouTube.shortsHidden,...l})}[i[1]]||((u,c)=>Ve(u,c,l)))(this.responseText,s);Object.defineProperty(this,"response",{writable:!0}),Object.defineProperty(this,"responseText",{writable:!0}),this.response=this.responseText=d}catch(p){console.error("NouScript:",p)}}),n.apply(this,[o,r])}}var Xo=["webm","vp8","vp9","av01"];function At(e){return function(t){if(t===void 0)return"";for(let n of Xo)if(t.indexOf(n)!==-1)return"";return e(t)}}function Rt(){try{let e=document.createElement("video"),t=e.canPlayType.bind(e);HTMLVideoElement.prototype.canPlayType=At(t)}catch{}try{let e=window.MediaSource;if(e&&typeof e.isTypeSupported=="function"){let t=e.isTypeSupported.bind(e);e.isTypeSupported=At(t)}}catch{}}var Zo=/^(https?:\/\/i\d?\.ytimg\.com\/(?:vi|vi_webp)\/[^/]+\/)(default|mqdefault|hqdefault|sddefault|hq720|hq1|hq2|hq3|maxresdefault)(_custom_\d+)?(\.[a-zA-Z0-9]+)(.*)$/;function ze(e,t){let n=Zo.exec(e);return!n||n[2]===t?e:`${n[1]}${t}${n[4]}${n[5]}`}function er(e,t){return e.replace(/(https?:\/\/i\d?\.ytimg\.com\/(?:vi|vi_webp)\/[^/]+\/)(default|mqdefault|hqdefault|sddefault|hq720|hq1|hq2|hq3|maxresdefault)(_custom_\d+)?(\.[a-zA-Z0-9]+)/g,`$1${t}$4`)}function It(e){if(!e||e==="default")return;try{let n=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");if(n?.set&&n.get){let o=n.set,r=n.get;Object.defineProperty(HTMLImageElement.prototype,"src",{configurable:!0,enumerable:!0,get(){return r.call(this)},set(i){o.call(this,typeof i=="string"?ze(i,e):i)}})}}catch{}try{let n=Element.prototype.setAttribute;Element.prototype.setAttribute=function(o,r){return this instanceof HTMLImageElement&&o==="src"&&typeof r=="string"?n.call(this,o,ze(r,e)):n.call(this,o,r)}}catch{}let t=()=>{document.querySelectorAll("img").forEach(n=>{let o=n.getAttribute("src");if(o){let r=ze(o,e);r!==o&&n.setAttribute("src",r)}}),document.querySelectorAll('[style*="ytimg.com"]').forEach(n=>{let o=n.getAttribute("style");if(o){let r=er(o,e);r!==o&&n.setAttribute("style",r)}})};document.body&&t(),document.addEventListener("DOMContentLoaded",t),setTimeout(t,1e3),setTimeout(t,3e3)}var A=(e,...t)=>String.raw({raw:e},...t);var Nt=[{id:"hide-mix-playlist",labelKey:"settings.userStyles.builtin.hideMixPlaylist.label",css:A`
      ytm-compact-radio-renderer:has(yt-collections-stack),
      ytm-compact-playlist-renderer:has(yt-collections-stack),
      ytm-rich-item-renderer:has(yt-collections-stack) {
        display: none !important;
      }
    `},{id:"hide-shorts-navbar",labelKey:"settings.userStyles.builtin.hideShortsInNavbar.label",css:A`
      yt-tab-shape[tab-title='Shorts'],
      ytd-guide-entry-renderer:has(a[href^='/shorts']),
      ytd-mini-guide-entry-renderer:has(a[href^='/shorts']),
      ytm-pivot-bar-item-renderer:has(.pivot-shorts) {
        display: none !important;
      }
    `},{id:"hide-community-posts",labelKey:"settings.userStyles.builtin.hideCommunityPosts.label",css:A`
      ytd-rich-section-renderer:has(ytd-post-renderer),
      ytd-post-renderer,
      ytd-backstage-post-thread-renderer,
      ytm-rich-section-renderer:has(ytm-post-renderer),
      ytm-post-renderer,
      ytm-backstage-post-thread-renderer {
        display: none !important;
      }
    `},{id:"hide-ask-button",labelKey:"settings.userStyles.builtin.hideAskButton.label",css:A`
      .you-chat-entrypoint-button,
      yt-button-view-model:has(> .you-chat-entrypoint-button) {
        display: none !important;
      }
    `},{id:"hide-home-feed",labelKey:"settings.userStyles.builtin.hideHomeFeed.label",css:A`
      ytd-browse[page-subtype='home'] #contents,
      ytm-browse [tab-identifier='FEwhat_to_watch'] ytm-rich-grid-renderer {
        display: none !important;
      }
    `},{id:"hide-related-videos",labelKey:"settings.userStyles.builtin.hideRelatedVideos.label",css:A`
      #related,
      ytd-watch-next-secondary-results-renderer,
      ytm-watch-next-secondary-results-renderer,
      ytm-item-section-renderer[section-identifier='related-items'] {
        display: none !important;
      }
    `},{id:"hide-end-screens",labelKey:"settings.userStyles.builtin.hideEndScreens.label",css:A`
      .ytp-ce-element,
      .ytp-endscreen-content,
      .ytp-suggested-video-overlay,
      .ytp-pause-overlay,
      .ytp-pause-overlay-container {
        display: none !important;
      }
    `}],ys=Nt.reduce((e,t)=>(e[t.id]=t,e),{}),tr=()=>({"hide-mix-playlist":{enabled:!1},"hide-shorts-navbar":{enabled:!1},"hide-community-posts":{enabled:!1},"hide-ask-button":{enabled:!1},"hide-home-feed":{enabled:!1},"hide-related-videos":{enabled:!1},"hide-end-screens":{enabled:!1}}),se=()=>({schemaVersion:5,builtins:tr(),customStyles:[],customScripts:[]}),Ht=(e,t)=>{let n=t||se(),o=Nt.filter(i=>n.builtins[i.id]?.enabled!==!1).map(i=>i.css.trim()).filter(Boolean),r=(n.customStyles||[]).filter(i=>i.enabled).filter(i=>i.css.trim()).map(i=>i.css.trim()).filter(Boolean);return[...o,...r].join(`

`)};var nr="(window.__nouUserScripts || (window.__nouUserScripts = { ran: {}, gen: 0 }))",hs=`;${nr}.gen++;`;var ae=e=>{let t=e>>>24&255,n=e>>>16&255,o=e>>>8&255,r=e&255;return`rgba(${n}, ${o}, ${r}, ${(t/255).toFixed(3)})`},or=(e,t)=>{switch(e){case 1:return`-1px -1px 0 ${t}, 1px -1px 0 ${t}, -1px 1px 0 ${t}, 1px 1px 0 ${t}`;case 2:return`2px 2px 2px ${t}`;case 3:return`1px 1px 0 ${t}`;case 4:return`-1px -1px 0 ${t}`;default:return"none"}},$t=e=>e<=.87?-1:e<=1.25?0:e<=1.75?1:e<=2.5?2:3,qt=e=>{if(!e?.enabled)return"";let t=[],n=[],o=[];e.foregroundColor!=null&&t.push(`color: ${ae(e.foregroundColor)} !important;`),e.backgroundColor!=null&&n.push(`background-color: ${ae(e.backgroundColor)} !important;`),e.edgeType!=null&&t.push(`text-shadow: ${or(e.edgeType,ae(e.edgeColor??4278190080))} !important;`),e.windowColor!=null&&o.push(`background-color: ${ae(e.windowColor)} !important;`);let r=[];return t.length&&r.push(`.ytp-caption-segment,
.captions-text,
.captions-text span {
  ${t.join(`
  `)}
}`),n.length&&r.push(`.ytp-caption-segment,
.captions-text span {
  ${n.join(`
  `)}
}`),o.length&&r.push(`.caption-window {
  ${o.join(`
  `)}
}`),r.join(`

`)};function y(e,t){window.NouTubeI?window.NouTubeI.onMessage(JSON.stringify({type:e,data:t})):window.electron&&window.electron.ipcRenderer.sendToHost(e,t)}function C(...e){console.log(...e),y("[content]",e.length>1?{data:[...e]}:e[0])}function W(e,t){if(!e)return t;try{return JSON.parse(e)}catch{return t}}var g=window.trustedTypes.createPolicy("nouPolicy",{createHTML:e=>e}),Q=document.location.host=="music.youtube.com";var De="_nou_pip",je="_nou_pip_ancestor",Ot=0,le;function We(){if(!window.NouTubePip){le=new Map;for(let e of["outerWidth","outerHeight"]){le.set(e,Object.getOwnPropertyDescriptor(window,e));let t=Math.max(window[e],e==="outerWidth"?screen.width:screen.height);Object.defineProperty(window,e,{configurable:!0,get:()=>t})}window.NouTubePip=!0}}async function Ut(e){let t=++Ot;if(!e){let r=!document.querySelector("video")?.paused;if(window.NouTubePip=!1,document.getElementById(De)?.remove(),document.querySelectorAll("."+je).forEach(i=>i.classList.remove(je)),await new Promise(i=>setTimeout(i,500)),t!==Ot)return;for(let[i,s]of le||[])s?Object.defineProperty(window,i,s):Reflect.deleteProperty(window,i);le=void 0,window.dispatchEvent(new Event("resize")),r&&window.NouTube.play();return}if(We(),document.fullscreenElement&&await document.exitFullscreen(),!window.NouTubePip)return;document.getElementById(De)?.remove();let n=document.querySelector("video");for(let r=n?.parentElement;r;r=r.parentElement)r.classList.add(je);let o=document.createElement("style");o.id=De,o.textContent=`
    body *:not(._nou_pip_ancestor):not(video) { display: none !important; }
    ._nou_pip_ancestor {
      position: fixed !important;
      inset: 0 !important;
      width: 100% !important;
      height: 100% !important;
      margin: 0 !important;
      padding: 0 !important;
      transform: none !important;
      overflow: visible !important;
    }
    html, body { background: black !important; }
    video {
      visibility: visible !important;
      position: fixed !important;
      inset: 0 !important;
      width: 100vw !important;
      height: 100vh !important;
      object-fit: contain !important;
      transform: none !important;
      z-index: 2147483647 !important;
    }
  `,document.head.appendChild(o),window.dispatchEvent(new Event("resize")),window.NouTube.play()}var rr=()=>window.NouTubeToken||"",ir="nou:settings",Vt="";function sr(){try{return JSON.parse(localStorage.getItem(ir)||"{}").pictureInPicture===!0}catch{return!1}}function Fe(){let e=document.querySelector("video"),t=!!document.fullscreenElement||document.location.pathname=="/watch",o=sr()&&!Q&&t&&e&&!e.paused&&!e.ended&&e.videoWidth>0?[e.videoWidth,e.videoHeight]:[0,0],r=o.join("x");r!=Vt&&(Vt=r,window.NouTubeI?.setPictureInPictureVideo?.(rr(),o[0],o[1]))}function zt(){if(!(!window.isAndroid||!window.NouTubeI?.setPictureInPictureVideo)){for(let e of["play","playing","pause","ended","emptied","loadedmetadata","resize"])document.addEventListener(e,Fe,!0);for(let e of["yt-navigate-finish","fullscreenchange","popstate","noutube:settings"])window.addEventListener(e,Fe);Fe()}}var Qe=typeof globalThis=="object"&&globalThis||typeof window=="object"&&window||typeof self=="object"&&self||typeof global=="object"&&global||function(){return this}();var Dt=typeof Qe.DOMException<"u"?Qe.DOMException:Error;var jt=class extends Dt{constructor(e="The operation was aborted"){super(e)}};function Ft(e,t,{signal:n,edges:o}={}){let r,i=null,s=o!=null&&o.includes("leading"),a=o==null||o.includes("trailing"),l=()=>{i!==null&&(e.apply(r,i),r=void 0,i=null)},p=()=>{a&&l(),m()},d=null,u=()=>{d!=null&&clearTimeout(d),d=setTimeout(()=>{d=null,p()},t)},c=()=>{d!==null&&(clearTimeout(d),d=null)},m=()=>{c(),r=void 0,i=null},f=()=>{l()},h=function(...T){if(n?.aborted)return;r=this,i=T;let w=d==null;u(),s&&w&&l()};return h.schedule=u,h.cancel=m,h.flush=f,n?.addEventListener("abort",m,{once:!0}),h}function Wt(e,{signal:t}={}){return new Promise((n,o)=>{let r=()=>{o(new jt)},i=()=>{clearTimeout(s),r()};if(t?.aborted)return r();let s=setTimeout(()=>{t?.removeEventListener("abort",i),n()},e);t?.addEventListener("abort",i,{once:!0})})}var Qt=0,ar=Number.POSITIVE_INFINITY,Yt=()=>!0;async function M(e,t){let n,o,r,i;typeof t=="number"?(n=Qt,o=t,r=void 0,i=Yt):(n=t?.delay??Qt,o=t?.retries??ar,r=t?.signal,i=t?.shouldRetry??Yt);let s;for(let a=0;a<=o;a++){if(r?.aborted)throw s??new Error("The retry operation was aborted due to an abort signal.");try{return await e()}catch(l){if(s=l,!i(l,a))throw l;if(a<o){let p=typeof n=="function"?n(a,s):n;await Wt(p)}}}throw s}function ce(e,t,{signal:n,edges:o=["leading","trailing"]}={}){let r=null,i=Ft(function(...a){r=Date.now(),e.apply(this,a)},t,{signal:n,edges:o}),s=function(...a){if(r==null&&(r=Date.now()),Date.now()-r>=t){r=Date.now(),e.apply(this,a),i.cancel(),i.schedule();return}i.apply(this,a)};return s.cancel=i.cancel,s.flush=i.flush,s}var lr='<svg height="24" viewBox="0 0 24 24" width="24"><path d="m12.71 12 8.15 8.15-.71.71L12 12.71l-8.15 8.15-.71-.71L11.29 12 3.15 3.85l.71-.71L12 11.29l8.15-8.15.71.71L12.71 12z"></path></svg>',cr='<svg height="20" viewBox="0 0 24 24" width="20" fill="currentColor"><path d="M16 3v11H7.59L5 16.59V3h11m1-1H4v17l4-4h9V2zM8 18h8l4 4V6h-1v13.59L16.41 17H8v1z"></path></svg>';function ur(e){let t=document.querySelector("div#_nou_livechat"),n=!!t;t||(t=document.createElement("div"),t.id="_nou_livechat"),t.innerHTML=g.createHTML(`
    <div>Loading...</div>
    <iframe src="https://www.youtube.com/live_chat?v=${e}&embed_domain=${document.location.hostname}"></iframe>
    <button>${lr}</button>
  `),n||(t.querySelector("button").onclick=()=>t.remove(),document.body.append(t)),window.innerWidth>1e3&&window.innerWidth>window.innerHeight?t.classList.add("right"):t.classList.remove("right")}function ue(){document.querySelector("div#_nou_livechat")?.remove(),document.querySelector("button#_nou_livechat_btn")?.remove()}function Kt(e){let t=document.querySelector("button#_nou_livechat_btn"),n=!!t;t||(t=document.createElement("button"),t.id="_nou_livechat_btn",t.innerHTML=g.createHTML(`${cr} Live chat`),t.onclick=()=>ur(e)),n||document.body.append(t)}var dr={en:"original",es:"original",fr:"originale",de:"original",it:"originale",pt:"original",ru:"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B",ja:"\u30AA\u30EA\u30B8\u30CA\u30EB",ko:"\uC6D0\uBCF8",zh:"\u539F\u59CB",ar:"\u0623\u0635\u0644\u064A",hi:"\u092E\u0942\u0932",bn:"\u09AE\u09C2\u09B2",id:"asli",tr:"orijinal",vi:"nguy\xEAn b\u1EA3n",th:"\u0E15\u0E49\u0E19\u0E09\u0E1A\u0E31\u0E1A",nl:"origineel",pl:"oryginalny",sv:"original",fi:"alkuper\xE4inen",no:"original",da:"original",cs:"origin\xE1l",el:"\u03C0\u03C1\u03C9\u03C4\u03CC\u03C4\u03C5\u03C0\u03BF",he:"\u05DE\u05E7\u05D5\u05E8\u05D9",ro:"original",hu:"eredeti",uk:"\u043E\u0440\u0438\u0433\u0456\u043D\u0430\u043B",fa:"\u0627\u0635\u0644\u06CC",ms:"asal",tl:"orihinal",ta:"\u0B85\u0B9A\u0BB2\u0BCD",ur:"\u0627\u0635\u0644",hr:"izvorni",bg:"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u0435\u043D",sk:"origin\xE1l",sl:"izvirnik",sr:"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B",lt:"originalus",lv:"ori\u0123in\u0101ls",et:"originaal",ka:"\u10DD\u10E0\u10D8\u10D2\u10D8\u10DC\u10D0\u10DA\u10D8",az:"orijinal",uz:"asl",kk:"\u0442\u04AF\u043F\u043D\u04B1\u0441\u049B\u0430",hy:"\u0562\u0576\u0585\u0580\u056B\u0576\u0561\u056F",km:"\u178A\u17BE\u1798",my:"\u1019\u1030\u101B\u103A\u1038",si:"\u0DB8\u0DD4\u0DBD\u0DCA",am:"\u12E8\u1218\u1300\u1218\u122A\u12EB\u12CD",ne:"\u092E\u094C\u0932\u093F\u0915",lo:"\u0E95\u0EBB\u0EC9\u0E99\u0EAA\u0EB0\u0E9A\u0EB1\u0E9A",mn:"\u044D\u0445",bo:"\u0F51\u0F44\u0F7C\u0F66\u0F0B\u0F42\u0F5E\u0F72\u0F0D",cy:"gwreiddiol",eo:"originala",eu:"jatorrizko",gl:"orixinal",gu:"\u0AAE\u0AC2\u0AB3",ha:"asali",ig:"izugbe",is:"upprunalegt",jv:"asli",kn:"\u0CAE\u0CC2\u0CB2",ku:"or\xEEj\xEEnal",ky:"\u0442\u04AF\u043F \u043D\u0443\u0441\u043A\u0430",lb:"original",mi:"taketake",ml:"\u0D2F\u0D25\u0D3E\u0D7C\u0D24\u0D4D\u0D25",mr:"\u092E\u0942\u0933",mt:"ori\u0121inali",or:"\u0B2E\u0B4C\u0B33\u0B3F\u0B15",pa:"\u0A05\u0A38\u0A32",ps:"\u0627\u0635\u0644\u064A",sd:"\u0627\u0635\u0644",sm:"muamua",sn:"chaicho",so:"asalka ah",sq:"origjinal",su:"asli",sw:"asili",te:"\u0C05\u0C38\u0C32\u0C41",tk:"asyl",tt:"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u044C",ug:"\u0626\u06D5\u0633\u0644\u0649",yi:"\u05D0\u05E8\u05D9\u05D2\u05D9\u05E0\u05E2\u05DC",yo:"atil\u1EB9ba",zu:"okwangempela",af:"oorspronklik",bs:"originalni",ca:"original",ceb:"orihinal",co:"uriginale",fy:"oarspronklik",ga:"bunaidh",gd:"t\xF9sail",haw:"kumu",hmn:"thawj",ht:"orijinal",ia:"original",ie:"original",io:"originala",kw:"gwredhek",la:"originalis",ln:"ya liboso",mg:"tany am-boalohany",mk:"\u043E\u0440\u0438\u0433\u0438\u043D\u0430\u043B\u0435\u043D",ny:"yoyamba",oc:"original",qu:"qallariy",rm:"original",rw:"cy'umwimerere",sa:"\u092E\u0942\u0932",sc:"originale",st:"ea pele",tg:"\u0430\u0441\u043B\u04E3",to:"\u02BBuluaki",wo:"nj\xEBkk",xh:"yokuqala","zh-tw":"\u539F\u59CB"},Jt=[...new Set(Object.values(dr))];function de(){let e=localStorage.getItem("nou:settings");if(!e)return!1;try{return JSON.parse(e).sponsorBlock}catch{return!1}}var Gt={sponsor:"#00d400",selfpromo:"#ffff00",interaction:"#cc00ff",intro:"#00ffff",outro:"#0202ed",preview:"#008fd6",music_offtopic:"#ff9900",poi_highlight:"#ff1684",filler:"#7300ff"},Ye="_nou_sb_segments",mr="_nou_sb_segment",pr=[".ytChapteredProgressBarHost",".ytp-progress-list",".progress-bar-line",".progress-bar-background"],fr=[".ytChapteredProgressBarChapteredPlayerBarChapter",".ytp-chapter-hover-container"];function yr(){let e=[];for(let t of pr)for(let n of document.querySelectorAll(t))n.offsetWidth>0&&e.push(n);return e}function hr(e){let t=[];for(let i of fr)if(t=Array.from(e.querySelectorAll(i)),t.length)break;if(!t.length)return[{start:0,end:1,left:0,width:e.offsetWidth}];let n=t.reduce((i,s)=>i+s.offsetWidth,0),o=[],r=0;for(let i of t){let s=parseFloat(i.style.width),a=i.style.width.endsWith("%")&&Number.isFinite(s)?s/100:i.offsetWidth/(n||1);o.push({start:r,end:r+a,left:i.offsetLeft,width:i.offsetWidth}),r+=a}return o[o.length-1].end=1,o}function Ke(){for(let e of document.querySelectorAll(`.${Ye}`))e.parentElement?.removeAttribute("data-nou-sb"),e.remove()}function me(e,t,n){if(!e||!n||!Number.isFinite(n))return;let o=t.map(({actionType:r,category:i,segment:s})=>`${r}:${i}:${s[0]}:${s[1]}`).join(",");for(let r of yr()){let i=r.querySelector(`.${Ye}`),s=hr(r),a=s.map(({start:p,end:d,left:u,width:c})=>`${p}:${d}:${u}:${c}`).join(","),l=`${e}:${n}:${o}:${r.offsetWidth}:${a}`;i&&r.dataset.nouSb===l||(i?.remove(),getComputedStyle(r).position=="static"&&(r.style.position="relative"),r.append(gr(t,n,s)),r.dataset.nouSb=l)}}function gr(e,t,n){let o=document.createElement("div");o.className=Ye;for(let r of e){if(r.actionType=="full")continue;let i=Gt[r.category]||Gt.sponsor,s=Math.max(0,Math.min(1,r.segment[0]/t)),a=Math.max(s,Math.min(1,r.segment[1]/t));for(let l of n){let p=Math.max(s,l.start),d=Math.min(a,l.end);if(s==a?d<p:d<=p)continue;let u=l.end-l.start;if(u<=0)continue;let c=(d-p)/u*l.width;if(s!=a&&c<.5)continue;let m=document.createElement("div");m.className=mr,m.style.left=`${l.left+(p-l.start)/u*l.width}px`,m.style.width=`${Math.max(s==a?2:1,c)}px`,m.style.background=i,o.append(m)}}return o}async function Xt(e){let t=await fetch(`https://sponsor.ajay.app/api/skipSegments?videoID=${e}`),n=[];return t.status==200&&(n=await t.json()),{videoId:e,segments:n}}var Y=[.25,.5,.75,1,1.25,1.5,1.75,2,2.5,3,3.5,4];function Zt(e){return`${e.toFixed(2).replace(/\.?0+$/,"")}x`}function en(e){return!Number.isFinite(e)||Y.includes(e)?Y:[...Y,e].sort((t,n)=>t-n)}var b,k="",_={videoId:"",segments:[]},tn=!1,nn="_nou_fullscreen_title",pe={playing:"nou:playing",settings:"nou:settings"};function an(){return W(localStorage.getItem(pe.settings),{})}function br(){let{playbackRate:e}=an();return typeof e=="number"&&Number.isFinite(e)?e:1}function vr(){let{playbackQuality:e}=an();return typeof e=="string"?e:"auto"}function ln(e){let t=document.querySelector("#movie_player video")||e?.querySelector?.("video")||document.querySelector("video");return t instanceof HTMLVideoElement?t:null}function wr(e){if(!window.isAndroid)return;let t=document.querySelector("#player-control-overlay .player-controls-content");if(!t||t.querySelector("player-fullscreen-top-controls"))return;let n=t.querySelector(`#${nn}`);n||(n=document.createElement("div"),n.id=nn,t.append(n)),n.textContent=e}function Sr(e){if(!(!e||e.__nouPlaybackRatesExtended))try{let t=e.getAvailablePlaybackRates?.bind(e),n=e.setPlaybackRate?.bind(e);if(!t||!n)return;e.getAvailablePlaybackRates=()=>Y,e.setPlaybackRate=o=>{let r=ln(e);r&&(r.playbackRate=o),o<=2&&n(o),y("playback-rate",{playbackRate:o})},e.__nouPlaybackRatesExtended=!0}catch(t){C("failed to extend playback rates",t)}}function xr(e){let t=br();try{e.setPlaybackRate?.(t)}catch(n){C("failed to apply playback rate",n)}}function _r(e){if(!(!e||e.__nouPlaybackQualityExtended))try{let t=e.setPlaybackQuality?.bind(e),n=e.setPlaybackQualityRange?.bind(e);t&&(e.setPlaybackQuality=o=>{t(o),y("playback-quality",{playbackQuality:o})}),n&&(e.setPlaybackQualityRange=(o,r)=>{n(o,r),y("playback-quality",{playbackQuality:o})}),e.__nouPlaybackQualityExtended=!0}catch(t){C("failed to extend playback quality",t)}}function kr(e){let t=vr();try{let n=e.getAvailableQualityLevels?.();if(t==="auto")return;Array.isArray(n)&&n.includes(t),e.setPlaybackQualityRange?e.setPlaybackQualityRange(t,t):e.setPlaybackQuality&&e.setPlaybackQuality(t)}catch(n){C("failed to apply playback quality",n)}}function cn(e){for(let t of e)for(let n of t.addedNodes.values()){let o=n;o.id=="movie_player"&&fe(o)}if(!b?.__nouPlayerBound||!b.isConnected){let t=document.querySelector("#movie_player");t&&fe(t)}}function fe(e){if(b=e,e.__nouPlayerBound)return;e.__nouPlayerBound=!0,Sr(b),_r(b),e.addEventListener("onApiChange",()=>K(e)),K(e);let t="",n=0,o=d=>{let{videoDetails:u}=e.getPlayerResponse?.()||{},c=u?.videoId,m=b.getVideoUrl?.()||"";if(!(!c||!m))return{url:m,videoId:c,title:u.title||"",thumbnail:u.thumbnail?.thumbnails?.at(-1)?.url||"",current:d,duration:Number(u.lengthSeconds)||0}},r=ce(d=>{localStorage.setItem(pe.playing,JSON.stringify({url:d.url,current:d.current})),y("progress",d)},5e3),i=ce(()=>{if(!e.getCurrentTime){ue();return}let d=e.getCurrentTime();window.NouTubeI?.notifyProgress(e.getPlayerState()==1,d);let u=o(d);if(u&&r(u),de()&&k==_.videoId&&_.segments.length){me(k,_.segments,n||e.getDuration?.()||0);for(let c of _.segments){let[m,f]=c.segment;if(d>m&&d<f){b.seekTo(f);return}}}else Ke()},1e3),s=()=>{de()&&k==_.videoId&&_.segments.length&&me(k,_.segments,n||e.getDuration?.()||0)};tn||(tn=!0,window.addEventListener("resize",s),document.addEventListener("fullscreenchange",()=>{s(),setTimeout(s,400)}));let a=!1,l=async d=>{y("play-state",{playing:d==1});let{playabilityStatus:u,videoDetails:c}=e.getPlayerResponse()||{};if(!c){ue();return}if(d==0&&!Q&&(localStorage.removeItem(pe.playing),y("playback-end")),document.location.host=="m.youtube.com"&&document.location.pathname=="/"){e.pauseVideo();return}if(!a){let I=ln(b);I&&(["play","pause","timeupdate"].forEach(ne=>{I.addEventListener(ne,i)}),I.addEventListener("ratechange",()=>{y("playback-rate",{playbackRate:I.playbackRate})}),a=!0)}let{title:m,author:f,thumbnail:h,lengthSeconds:T,videoId:w}=c;if(wr(m),k!=w){r.cancel(),b.unMute();let I=h.thumbnails.at(-1);if(n=+T,t=m,window.NouTubeI?.notify(t,f,n,I?.url||""),k=w,window.NouTubeI&&(Er(),ue(),u?.liveStreamability&&Kt(k)),Ke(),_={videoId:"",segments:[]},de()){let ne=await Xt(w);if(k!==w)return;_=ne,me(w,ne.segments,n)}xr(b),kr(b)}};e.addEventListener("onStateChange",l);let p=e.getPlayerState?.();(p===1||p===2||p===3)&&l(p)}document.addEventListener("click",e=>{e.target?.closest?.(".fullscreen-icon, .ytp-fullscreen-button")&&(window.NouTubeFsIntent=Date.now())},!0);screen.orientation.addEventListener("change",e=>{if(window.NouTubePip||document.location.pathname!="/watch"||document.visibilityState!="visible")return;e.target.type.includes("landscape")?!document.fullscreenElement&&screen.availWidth<1e3&&document.querySelector("#player-control-container .fullscreen-icon")?.click():document.fullscreenElement&&document.exitFullscreen()});async function un(){await M(()=>{if(!b)throw"player not ready";return b},{retries:30,delay:100}),b?.playVideo();let e=await M(()=>{let s=b.getAvailableAudioTracks();if(!s.length)throw"tracks not ready";return s},{retries:30,delay:100}),t="",n,o=0;for(let s of e){for(let a of Object.values(s)){let l=a;l&&typeof l=="object"&&"isDefault"in l&&l.name&&(Jt.some(p=>l.name.includes(p))&&(n=o.toString(),b.setAudioTrack(s)),t+=`<option value="${o}">${l.name}</option>`)}o++}let r=document.querySelector("div#_nou_audio_picker");r||(r=document.createElement("div"),r.id="_nou_audio_picker",document.body.append(r)),r.innerHTML=g.createHTML(`
    <select>
      ${t}
    </select>
  `);let i=r.querySelector("select");i&&(n&&(i.value=n),i.onchange=s=>{let a=s.target.value;a!=null&&b.setAudioTrack(e[+a])})}async function Er(){if(document.location.pathname!="/watch"||Q)return;let e=await M(async()=>{let n=document.querySelector("ytm-slim-video-information-renderer ytm-badge-supported-renderer");if(!n)throw"badge not ready";return n},{retries:30,delay:100});if(!e)return;let t=document.createElement("div");t.id="_nou_audio_btn",t.innerHTML=g.createHTML(`
    Play original audio \u{1F9A6}
  `),t.onclick=n=>{n.stopPropagation(),b.pauseVideo(),y("embed",k)},e.append(t)}var on=5;function rn(e){try{return new URL(e,document.location.href).searchParams.get("v")||""}catch{return""}}function sn(e){try{return new URL(e,document.location.href).searchParams.has("t")}catch{return!1}}async function Tr(e){try{(await M(async()=>{let n=document.getElementById("movie_player");if(!n?.seekTo)throw"player not ready";return n},{retries:30,delay:100}))?.seekTo(e)}catch(t){C("failed to seek to the saved position",t)}}function dn(){let e=W(localStorage.getItem(pe.playing),{});if(!e.url)return;let t=Number(e.current)||0,n=rn(e.url);if(n&&n==rn(document.location.href)){t>=on&&!sn(document.location.href)&&Tr(t);return}document.location.href=t>=on&&!sn(e.url)?Lr(e.url,t):e.url}function Lr(e,t){try{let n=new URL(e,document.location.href);return n.searchParams.set("t",`${Math.floor(t)}s`),n.href}catch{return e}}var Cr=()=>document.getElementById("movie_player"),Mr=e=>({itag:e?.itag,mimeType:e?.mimeType,qualityLabel:e?.qualityLabel,height:e?.height,fps:e?.fps,bitrate:e?.bitrate,averageBitrate:e?.averageBitrate,contentLength:e?.contentLength}),pn=e=>{let t=e?.streamingData,n=[...t?.formats??[],...t?.adaptiveFormats??[]];return n.length?{videoId:e?.videoDetails?.videoId??"",title:e?.videoDetails?.title??"",formats:n.map(Mr)}:null},Br=e=>{try{let t=Cr()?.getPlayerResponse?.();return!t||t?.videoDetails?.videoId!==e?null:pn(t)}catch{return null}},mn=e=>{let t=window.ytcfg;try{return t?.get?.(e)??t?.data_?.[e]}catch{return t?.data_?.[e]}},Pr=async e=>{let t=mn("INNERTUBE_CONTEXT");if(!t)return null;let n=mn("INNERTUBE_API_KEY"),o=await fetch(`/youtubei/v1/player?prettyPrint=false${n?`&key=${n}`:""}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({context:t,videoId:e,contentCheckOk:!0,racyCheckOk:!0})});if(!o.ok)return null;let r=await o.json(),i=r?.playabilityStatus?.status;return i&&i!=="OK"?null:pn(r)},fn=async e=>Br(e)??Pr(e).catch(()=>null);var E="noutube:settings",Je="noutube:user-styles",Ge="noutube:blocklist",J={},ye=se(),he=D(),S=()=>document.getElementById("movie_player"),yn=!1;function Ar(){yn||(yn=!0,window.addEventListener("keyup",e=>{y("keyup",{key:e.key,metaKey:e.metaKey,ctrlKey:e.ctrlKey})}),window.addEventListener("paste",e=>{if(hn(e.target)||hn(document.activeElement))return;let t=e.clipboardData?.getData("text");t&&y("paste",t)}))}function hn(e){if(!e)return!1;let t=e.tagName?.toUpperCase?.();return t==="INPUT"||t==="TEXTAREA"||t==="SELECT"||e.isContentEditable===!0}function Rr(){return J}function gn(e={}){return J={...J,...e},window.dispatchEvent(new CustomEvent(E,{detail:J})),J}function Ir(){return ye}function bn(e){return ye=e||se(),window.dispatchEvent(new CustomEvent(Je,{detail:ye})),ye}function Nr(){return he}function vn(e){return he=e||D(),window.dispatchEvent(new CustomEvent(Ge,{detail:he})),he}function wn(){return window.NouTubeInitialSettings&&gn(window.NouTubeInitialSettings),window.NouTubeBlocklist&&vn(window.NouTubeBlocklist),window.NouTubeUserStyles&&bn(window.NouTubeUserStyles),zt(),{getSettings:Rr,setSettings:gn,getUserStyles:Ir,setUserStyles:bn,getBlocklist:Nr,setBlocklist:vn,preparePictureInPicture:We,setPictureInPicture:Ut,shortsHidden:!0,play:()=>S()?.playVideo(),pause:()=>S()?.pauseVideo(),prev:()=>S()?.previousVideo(),next:()=>S()?.nextVideo(),seekBy:e=>S()?.seekBy(e),seekTo:e=>S()?.seekTo(e),getVideoUrl:()=>S()?.getVideoUrl?.()||"",getPlaybackRate:()=>S()?.getPlaybackRate?.(),setPlaybackRate:e=>S()?.setPlaybackRate?.(e),getPlaybackQuality:()=>S()?.getPlaybackQuality?.(),setPlaybackQuality:e=>{let t=S();t&&(t.setPlaybackQualityRange?t.setPlaybackQualityRange(e,e):t.setPlaybackQuality&&t.setPlaybackQuality(e))},hideShorts(){Sn(),this.shortsHidden=!0},showShorts(){xn(),this.shortsHidden=!1},playDefaultAudio:un,restoreLastPlaying:dn,bridgeShortcuts:Ar,getPlayerFormats:fn}}var _n=null,Xe="nou:caption-font-size",Hr=()=>{try{let e=localStorage.getItem(Xe);if(e==null)return null;let t=Number(e);return Number.isFinite(t)?t:null}catch{return null}},kn=()=>window.NouTube?.getSettings?.()?.captionStyle||null,En=()=>qt(kn());function K(e){e&&(_n=e);let t=_n||document.getElementById("movie_player");if(!t||typeof t.setOption!="function")return;let n=t.getOptions?.();if(!Array.isArray(n)||!n.includes("captions"))return;let o=kn(),r=Hr();if(!o?.enabled){if(r!=null)try{t.setOption("captions","fontSize",r),localStorage.removeItem(Xe)}catch{}return}if(r==null)try{let i=t.getOption?.("captions","fontSize");localStorage.setItem(Xe,String(typeof i=="number"?i:0))}catch{}try{t.setOption("captions","fontSize",$t(o.fontScale))}catch{}}function Ze(){window.addEventListener(E,()=>K()),K()}var Tn="_nou_injected_css",G=(e,...t)=>String.raw({raw:e},...t),$r=G`
  /*
   * Text zoom (webView textZoom) scales fonts but not the fixed pixel heights
   * YouTube hardcodes on its text containers, so zoomed titles/headlines get
   * clipped. Drop those height clamps so the boxes grow with the text;
   * -webkit-line-clamp still truncates long titles to the intended line count.
   *
   * The player is excluded: its own class list carries title-related flags
   * (ytp-hide-fullscreen-title), and forcing height:auto on #movie_player
   * collapses it to 0, clipping the video away.
   */
  :is(
      [class*='headline' i],
      [class*='title' i],
      [class*='subhead' i],
      [class*='channel-name' i]
    ):not(#movie_player, #movie_player *) {
    height: auto !important;
    max-height: none !important;
  }

  /*
   * YouTube's control scrim fades to fully transparent at the bottom, but the
   * progress bar sits ~80% down, so the track (white at 35% alpha) disappears
   * over a bright frame. Darken the bottom and outline the bar to keep it and
   * the SponsorBlock segments readable.
   */
  #player-control-overlay .player-controls-background::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(to top, rgba(0, 0, 0, 0.7), rgba(0, 0, 0, 0) 35%);
    pointer-events: none;
  }

  #player-control-overlay .ytPlayerProgressBarHost {
    filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.6));
  }

  /*
   * YouTube Music mobile: when minimized to the bottom player bar,
   * YouTube Music's collapse selector typo leaves ytmusic-app-layout fixed and
   * leaves full player page backgrounds and overlays active over browsing content.
   */
  ytmusic-app-layout[player-ui-state='PLAYER_BAR_ONLY'] {
    position: static !important;
    animation: none !important;
    transform: none !important;
  }

  ytmusic-player-page[player-ui-state='PLAYER_BAR_ONLY'] {
    visibility: hidden !important;
    background: transparent !important;
    pointer-events: none !important;
  }

  ytmusic-player-page[player-ui-state='PLAYER_BAR_ONLY'] ytmusic-player {
    visibility: visible !important;
    pointer-events: auto !important;
  }

  #_nou_fullscreen_title {
    display: none;
  }

  #player-container-id:fullscreen #_nou_fullscreen_title {
    display: block;
    position: absolute;
    top: 14px;
    left: 24px;
    right: 192px;
    z-index: 2;
    overflow: hidden;
    color: white;
    font-size: 18px;
    font-weight: 500;
    line-height: 24px;
    text-overflow: ellipsis;
    white-space: nowrap;
    pointer-events: none;
  }

  /*
   * Newer YouTube ships its own fullscreen title inside
   * player-fullscreen-top-controls, but keeps the whole host visibility:hidden
   * until the "More videos" panel opens. Unhide just the title (not the close
   * button next to it) and drop ours, otherwise both stack in the same corner.
   * Scoped to .fadein because the controls hide by flipping visibility, and a
   * title forced visible would stay burned over the video.
   */
  #player-container-id:fullscreen
    #player-control-overlay.fadein
    .ytwPlayerFullscreenTopControlsFullscreenControlsVideoTitle {
    visibility: visible;
    /*
     * The title box spans the full width, under the top-right control cluster.
     * YouTube gets away with that because the whole host is hidden; once we
     * make the title visible it starts hit-testing and swallows taps on the
     * captions and settings buttons, so it has to stay inert like ours.
     */
    pointer-events: none;
    /*
     * Its flex parent only reserves room for the close button (40px) next to
     * the host's 12px padding, so the title still runs under the controls.
     * Back both out of the 192px inset ours uses to land on the same edge.
     */
    margin-right: 140px;
  }

  #player-container-id:fullscreen
    #player-control-overlay:has(player-fullscreen-top-controls)
    #_nou_fullscreen_title {
    display: none;
  }

  /*
   * Fullscreen controls button: only in fullscreen, and only while the controls
   * are showing, so it never burns over the video. Left edge keeps it clear of
   * the centered play/seek buttons and the top-right control cluster. Hidden
   * once the panel or the lock overlay takes over.
   *
   * --_nou_cutout_left is published by the native view (NouTubeView.kt): the
   * fullscreen window draws under the display cutout, and in landscape the
   * camera sits on a side edge at the same height as the button.
   */
  #_nou_fs_btn {
    display: none;
  }

  #player-container-id:fullscreen:has(#player-control-overlay.fadein):not(
      :has(#_nou_lock_overlay, #_nou_fs_panel)
    )
    > #_nou_fs_btn {
    display: flex;
    position: fixed;
    top: 50%;
    left: calc(16px + var(--_nou_cutout_left, 0px));
    z-index: 2147483646;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    transform: translateY(-50%);
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
  }

  /* Same chain as above so it outweighs the left-edge rule. */
  #player-container-id:fullscreen:has(#player-control-overlay.fadein):not(
      :has(#_nou_lock_overlay, #_nou_fs_panel)
    )
    > #_nou_fs_btn.right {
    left: auto;
    right: calc(16px + var(--_nou_cutout_right, 0px));
  }

  #_nou_lock_overlay {
    position: fixed;
    inset: 0;
    z-index: 2147483647;
    touch-action: none;
    -webkit-user-select: none;
    user-select: none;
  }

  #_nou_lock_overlay ._nou_lock_unlock {
    position: absolute;
    top: 50%;
    left: calc(16px + var(--_nou_cutout_left, 0px));
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    transform: translateY(-50%);
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.6);
    color: white;
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }

  #_nou_lock_overlay.right ._nou_lock_unlock {
    left: auto;
    right: calc(16px + var(--_nou_cutout_right, 0px));
  }

  #_nou_lock_overlay.reveal ._nou_lock_unlock {
    opacity: 1;
    pointer-events: auto;
  }
`,qr=G`
  /*
   * The scrim only exists to give taps outside the panel something to land on;
   * the panel's own event blocking still runs, this just keeps the hit area from
   * falling through to YouTube's own layers visually.
   */
  #_nou_fs_scrim {
    position: fixed;
    inset: 0;
    z-index: 2147483646;
  }

  #_nou_fs_panel {
    position: fixed;
    top: 50%;
    left: calc(16px + var(--_nou_cutout_left, 0px));
    z-index: 2147483647;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 12px;
    max-width: min(420px, calc(100vw - 32px - var(--_nou_cutout_left, 0px) - var(--_nou_cutout_right, 0px)));
    max-height: 80vh;
    overflow-y: auto;
    padding: 14px 16px;
    transform: translateY(-50%);
    border-radius: 14px;
    background: rgba(0, 0, 0, 0.82);
    color: white;
    font-size: 13px;
    touch-action: pan-x pan-y;
    -webkit-user-select: none;
    user-select: none;
  }

  #_nou_fs_panel.right {
    left: auto;
    right: calc(16px + var(--_nou_cutout_right, 0px));
  }

  #_nou_fs_panel ._nou_fs_row {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  #_nou_fs_panel ._nou_fs_label {
    flex: none;
    width: 52px;
    color: rgba(255, 255, 255, 0.7);
  }

  #_nou_fs_panel ._nou_fs_chips {
    display: flex;
    gap: 6px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  #_nou_fs_panel ._nou_fs_chips::-webkit-scrollbar {
    display: none;
  }

  #_nou_fs_panel ._nou_fs_chip {
    flex: none;
    padding: 5px 10px;
    border: none;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    font-size: 13px;
    line-height: 1;
  }

  #_nou_fs_panel ._nou_fs_chip.active {
    background: #4f46e5;
  }

  #_nou_fs_panel ._nou_fs_value {
    flex: none;
    width: 40px;
    color: rgba(255, 255, 255, 0.7);
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  #_nou_fs_panel #_nou_fs_lock {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 8px 10px;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
    font-size: 14px;
  }

  #_nou_fs_panel #_nou_fs_side {
    display: flex;
    flex: none;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: none;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.12);
    color: white;
  }

  /*
   * The WebView's native range widget centres its thumb on its own track
   * metrics, which do not match the 4px track we want, so draw both parts
   * ourselves. --_nou_fill is written by the panel on every input so the filled
   * portion still tracks the value without accent-color.
   */
  #_nou_fs_panel ._nou_fs_slider {
    flex: 1;
    height: 16px;
    margin: 0;
    padding: 0;
    border: none;
    outline: none;
    box-shadow: none;
    background: transparent;
    -webkit-appearance: none;
    appearance: none;
  }

  #_nou_fs_panel ._nou_fs_slider::-webkit-slider-runnable-track {
    height: 4px;
    border-radius: 2px;
    background: linear-gradient(
      to right,
      #4f46e5 var(--_nou_fill, 0%),
      rgba(255, 255, 255, 0.3) var(--_nou_fill, 0%)
    );
  }

  #_nou_fs_panel ._nou_fs_slider::-webkit-slider-thumb {
    width: 14px;
    height: 14px;
    margin-top: -5px;
    border: none;
    border-radius: 50%;
    background: white;
    -webkit-appearance: none;
    appearance: none;
  }
`,Or=G`
  /*
   * Fullscreen controls button, web player. The Android rule keys off
   * #player-container-id and the mobile control overlay, neither of which the
   * desktop site has; here the button is a direct child of whatever element
   * YouTube put into fullscreen, and fullscreen-controls.ts toggles .hidden to
   * follow the player's own autohide.
   */
  #_nou_fs_btn {
    display: none;
  }

  :fullscreen > #_nou_fs_btn {
    position: fixed;
    top: 50%;
    left: 16px;
    z-index: 2147483646;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    padding: 0;
    transform: translateY(-50%);
    border: none;
    border-radius: 50%;
    background: rgba(0, 0, 0, 0.5);
    color: white;
    cursor: pointer;
    opacity: 1;
    transition: opacity 0.2s;
  }

  :fullscreen > #_nou_fs_btn:hover {
    background: rgba(0, 0, 0, 0.75);
  }

  :fullscreen > #_nou_fs_btn.right {
    left: auto;
    right: 16px;
  }

  /* Faded rather than display:none so it can still be hovered back into view. */
  :fullscreen > #_nou_fs_btn.hidden {
    opacity: 0;
  }

  /*
   * A mouse cannot swipe a chip strip, and shift+wheel is not something to make
   * the only way to reach the last few chips, so wrap them instead of scrolling
   * on desktop.
   */
  #_nou_fs_panel ._nou_fs_chips {
    flex-wrap: wrap;
    overflow-x: visible;
  }

  /* Once the chips wrap, the label belongs beside the first row of them, not
     centred against the whole block. 23px is a chip's height: 13px of text plus
     its 5px padding. */
  #_nou_fs_panel ._nou_fs_row:has(._nou_fs_chips) {
    align-items: flex-start;
  }

  #_nou_fs_panel ._nou_fs_row:has(._nou_fs_chips) ._nou_fs_label {
    line-height: 23px;
  }

  #_nou_fs_panel ._nou_fs_chip,
  #_nou_fs_panel #_nou_fs_side {
    cursor: pointer;
  }

  #_nou_fs_panel ._nou_fs_chip:hover:not(.active) {
    background: rgba(255, 255, 255, 0.24);
  }

  #_nou_fs_panel #_nou_fs_side:hover {
    background: rgba(255, 255, 255, 0.24);
  }
`,Vr=G`
  ytd-page-top-ad-layout-renderer,
  ytd-in-feed-ad-layout-renderer,
  ad-slot-renderer,
  yt-mealbar-promo-renderer,
  ytm-promoted-sparkles-web-renderer,
  .ytd-player-legacy-desktop-watch-ads-renderer {
    display: none !important;
  }

  /* Ads are normally dropped from the feed data, but if one still renders, hide
   * its grid cell too, otherwise the hidden ad leaves a blank tile behind. */
  ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
  ytd-rich-item-renderer:has(ytd-in-feed-ad-layout-renderer),
  ytd-rich-section-renderer:has(ytd-ad-slot-renderer),
  ytd-rich-section-renderer:has(ytd-statement-banner-renderer),
  ytd-item-section-renderer:has(ytd-ad-slot-renderer),
  ytm-rich-item-renderer:has(ad-slot-renderer),
  ytm-item-section-renderer:has(ad-slot-renderer),
  ytd-rich-item-renderer:has(ad-slot-renderer),
  ytd-rich-item-renderer:has(.ytwFeedAdMetadataViewModelHostMetadata) {
    display: none !important;
  }
`,Ur=G`
  a.app-install-link,
  a.yt-spec-button-shape-next {
    display: none !important;
  }

  #_nou_livechat {
    width: 100%;
    height: 50vh;
    position: fixed;
    bottom: 0;
    display: flex;
    flex-direction: column;
    border-top: 1px solid #e5e5e5;
    background: white;
    z-index: 10;
  }
  #_nou_livechat.right {
    width: 36vw;
    height: 100%;
    top: 0;
    bottom: 0;
    right: 0;
    border-top: none;
    border-left: 1px solid #e5e5e5;
  }

  #_nou_livechat button {
    position: absolute;
    top: 1.25rem;
    left: 50%;
    transform: translateX(-50%);
  }

  #_nou_livechat div {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
  }

  #_nou_livechat iframe {
    position: relative;
    flex: 1;
    border: none;
  }

  #_nou_livechat_btn {
    padding: 0.75rem 1rem;
    background: #e1002d;
    color: white;
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    border-radius: 18px;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 16px;
  }

  .quick-actions-wrapper.enable-rtl-mirroring {
    display: none !important;
  }

  #_nou_audio_btn {
    display: flex;
    align-items: center;
    background: #34d399;
    padding: 0 4px;
    color: #44403c;
    border-radius: 4px;
    margin-left: 8px;
  }
  #_nou_audio_picker {
    position: absolute;
    top: 1rem;
    left: 1rem;
  }
  #_nou_audio_picker select {
    border: none;
    background: #a7f3d0;
    color: #44403c;
    padding: 2px;
  }

  ._nou_sb_segments {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }
  ._nou_sb_segment {
    position: absolute;
    top: 0;
    height: 100%;
    opacity: 0.85;
  }
`,zr=()=>{let e=!!window.NouTubeI;return(window.NouTube?.getSettings?.()?.blockAds!==!1?Vr:"")+Ur+(e?$r:Or)+qr},Dr=e=>[zr(),En(),Ht(document.location.host,e)].filter(Boolean).join(`

`);function et(){let e=document.querySelector(`#${Tn}`)||document.createElement("style"),t=()=>{let n=window.NouTube?.getUserStyles?.();e.textContent=Dr(n)};e.id=Tn,e.type="text/css",t(),(document.head||document.documentElement).appendChild(e),window.addEventListener(E,t),window.addEventListener(Je,t)}function Sn(){let e=document.createElement("style");e.id="noutube-shorts",e.type="text/css",e.textContent=`
ytm-reel-shelf-renderer,
ytd-reel-shelf-renderer,
.ytGridShelfViewModelHost,
grid-shelf-view-model,
ytd-rich-section-renderer:has(ytd-rich-shelf-renderer[is-shorts]),
ytm-shorts-lockup-view-model,
yt-lockup-view-model:has(a[href^='/shorts']),
ytd-video-renderer:has(a[href^='/shorts']),
ytm-video-with-context-renderer:has(a[href^='/shorts']) {
  display: none !important;
}
`,document.head.appendChild(e)}function xn(){document.querySelector("style#noutube-shorts")?.remove()}var Ln=!1;function Cn(){if(Ln)return;let e=document.querySelector("tp-yt-paper-dialog");if(!e)return;new MutationObserver(n=>{let o=e.querySelector("ytmusic-mealbar-promo-renderer .dismiss-button");o&&o.click()}).observe(e,{attributes:!0}),Ln=!0}var Mn='<svg height="16" viewBox="0 0 24 24" width="16" focusable="false" aria-hidden="true" style="pointer-events: none; display: inherit; width: 100%; height: 100%;"><path d="M21 16h-7v-1h7v1zm0-5H9v1h12v-1zm0-4H3v1h18V7zm-11 8-7-4v8l7-4z"></path></svg>',Bn='<svg height="24" viewBox="0 -960 960 960" width="24" style="transform:scale(1.25)"><path d="m354-287 126-76 126 77-33-144 111-96-146-13-58-136-58 135-146 13 111 97-33 143Zm-61 83.92 49.62-212.54-164.93-142.84 217.23-18.85L480-777.69l85.08 200.38 217.23 18.85-164.93 142.84L667-203.08 480-315.92 293-203.08ZM480-470Z"/></svg>',Pn='<svg height="24" viewBox="0 0 24 24" width="24" style="transform:scale(1.1)"><path d="M5 20h14v-2H5v2Zm7-2 5.5-5.5-1.42-1.42L13 14.16V4h-2v10.16L7.92 11.08 6.5 12.5 12 18Z"/></svg>';var jr=({icon:e,label:t})=>g.createHTML(`
    <button class="menu-item-button" style="display: flex; align-items: center; width: 100%; padding: 0 16px; min-height: 48px; background: none; border: none; font-family: inherit; font-size: 14px; text-align: left; cursor: pointer;">
      <c3-icon fill-icon="false" style="margin-right: 16px; flex-shrink: 0; width: 24px; height: 24px;">
        <span class="yt-icon-shape yt-spec-icon-shape" style="width: 24px; height: 24px; display: block;">
          <div style="width: 24px; height: 24px; display: block; fill: currentcolor;">${e}</div>
        </span>
      </c3-icon>
      <span class="yt-core-attributed-string" role="text" style="flex: 1; font-size: 14px;">${t} \u{1F9A6}</span>
    </button>
  `),Fr=({icon:e,label:t})=>g.createHTML(`
    <tp-yt-paper-item
      class="style-scope ytd-menu-service-item-renderer"
      role="option"
      style="display: flex; align-items: center; width: 100%; padding: 0 16px; min-height: 40px; cursor: pointer;"
    >
      <yt-icon class="style-scope ytd-menu-service-item-renderer" style="margin-right: 16px; flex-shrink: 0; width: 24px; height: 24px;">
        <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost" style="width: 24px; height: 24px; display: block;">
          <div style="width: 24px; height: 24px; display: block; fill: currentcolor;">${e}</div>
        </span>
      </yt-icon>
      <yt-formatted-string class="style-scope ytd-menu-service-item-renderer" style="flex: 1; font-size: 14px;">${t} \u{1F9A6}</yt-formatted-string>
    </tp-yt-paper-item>
  `),An=(e,{icon:t,label:n})=>{e.querySelectorAll("[id]").forEach(i=>i.removeAttribute("id"));let o=e.querySelector(".ytListItemViewModelImage, .yt-list-item-view-model__image, c3-icon, yt-icon");if(o){let i=document.createElement("span");i.className=o.className,i.setAttribute("aria-hidden","true"),i.style.display="block",i.style.width="24px",i.style.height="24px",i.style.flexShrink="0",e.tagName.toLowerCase()==="ytm-menu-item"&&(i.style.marginRight="16px"),i.innerHTML=g.createHTML(`
      <span class="yt-icon-shape ytSpecIconShapeHost" style="width: 24px; height: 24px; display: block;">
        <div style="width: 24px; height: 24px; display: block; fill: currentcolor;">${t}</div>
      </span>
    `),o.replaceWith(i)}let r=e.querySelector('.ytListItemViewModelTitle, .yt-list-item-view-model__title, .ytAttributedStringHost, .yt-core-attributed-string[role="text"], yt-formatted-string');return r&&(r.textContent=`${n} \u{1F9A6}`,r.removeAttribute("is-empty")),e},Rn=e=>Array.from(e.children).find(t=>t.tagName.toLowerCase()==="yt-list-item-view-model"&&!t.className.includes("_nou_")),tt=(e,t,n,o)=>{let r;switch(e.tagName.toLowerCase()){case"yt-list-view-model":{let i=o||Rn(e);if(!i)throw new Error("native list menu item is unavailable");r=An(i.cloneNode(!0),t);break}case"tp-yt-paper-listbox":r=document.createElement("ytd-menu-service-item-renderer"),r.innerHTML=Fr(t);break;default:{let i=Array.from(e.children).find(s=>s.tagName.toLowerCase()==="ytm-menu-item"&&!s.className.includes("_nou_"));r=i?An(i.cloneNode(!0),t):document.createElement("ytm-menu-item"),i||(r.innerHTML=jr(t))}}return r.classList.add(n),r};function In(){document.addEventListener("click",async e=>{let n=e.target.closest("ytm-media-item,ytm-compact-video-renderer,yt-lockup-metadata-view-model,ytd-video-renderer,ytd-grid-video-renderer");if(n){let o=await M(async()=>{let u=document.querySelectorAll("ytm-menu-service-item-renderer,ytm-menu-navigation-item-renderer,yt-list-view-model,tp-yt-paper-listbox"),c=Array.from(u).find(m=>m.offsetHeight>0);if(c){if(c.tagName.toLowerCase()==="yt-list-view-model"){let m=Rn(c);if(!m)throw"menu items not ready";return{menu:c,listItemTemplate:m.cloneNode(!0)}}return{menu:c}}throw"menu not ready"},{retries:50,delay:100}),{menu:r,listItemTemplate:i}=o,s=n.querySelector("h3")?.textContent?.trim()||n.querySelector("h4")?.textContent?.trim(),a=n.querySelector("a")?.href,l;if(window.NouTubeI){let u="_nou_queue_";r.querySelectorAll(`.${u}`).forEach(c=>c.remove()),l=tt(r,{icon:Mn,label:"Add to queue"},u,i),l.onclick=()=>{a&&y("add-queue",{title:s,url:a}),l.remove()},r.prepend(l)}let p="_nou_menu_";r.querySelectorAll(`.${p}`).forEach(u=>u.remove());let d={icon:Bn,label:"Star"};l=tt(r,d,p,i),l.onclick=()=>{a&&y("star",{title:s,url:a})},r.prepend(l);{let u="_nou_download_";r.querySelectorAll(`.${u}`).forEach(f=>f.remove());let c={icon:Pn,label:"Download"},m=tt(r,c,u,i);if(m.onclick=()=>{a&&y("download",{url:a})},r.prepend(m),r.tagName.toLowerCase()=="tp-yt-paper-listbox"){let f=m.querySelector("yt-formatted-string");f?.hasAttribute("is-empty")&&(f.textContent=c.label+" \u{1F9A6}",f.removeAttribute("is-empty"));let h=m.querySelector("yt-icon");h?.hasAttribute("hidden")&&(h.innerHTML=g.createHTML(`
              <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost">
                <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">${c.icon}</div>
              </span>
            `),h.removeAttribute("hidden"))}}if(r.tagName.toLowerCase()=="tp-yt-paper-listbox"){let u=l.querySelector("yt-formatted-string");u?.hasAttribute("is-empty")&&(u.textContent=d.label+" \u{1F9A6}",u.removeAttribute("is-empty"));let c=l.querySelector("yt-icon");c?.hasAttribute("hidden")&&(c.innerHTML=g.createHTML(`
            <span class="yt-icon-shape style-scope yt-icon ytSpecIconShapeHost">
              <div style="width: 100%; height: 100%; display: block; fill: currentcolor;">${d.icon}</div>
            </span>
          `),c.removeAttribute("hidden"))}}})}function Nn(){let e=document.querySelector("meta[name=viewport]");if(e){let t=e.getAttribute("content");if(t){let n=t.split(","),o=!1;["maximum-scale","user-scalable"].forEach(r=>{t.includes(r)&&(n=n.filter(i=>!i.includes(r)),o=!0)}),o&&e.setAttribute("content",n.join(","))}}}var ge="_nou_blocked",Hn="_nou_blocklist_css",ot=["ytm-media-item","ytm-compact-video-renderer","ytm-video-with-context-renderer","ytd-video-renderer","ytd-compact-video-renderer","ytd-grid-video-renderer","ytd-rich-item-renderer","yt-lockup-view-model","yt-lockup-metadata-view-model"].join(",");function Wr(){if(document.getElementById(Hn))return;let e=document.createElement("style");e.id=Hn,e.textContent=`.${ge}{display:none!important;}`,(document.head||document.documentElement).appendChild(e)}function Qr(){return window.NouTube?.getBlocklist?.()||D()}function x(e){return e?.textContent?.trim()||""}function Yr(e){return[x(e.querySelector("h3")),x(e.querySelector("h4")),x(e.querySelector("#video-title")),x(e.querySelector("a#video-title")),x(e.querySelector(".yt-lockup-metadata-view-model-wiz__title")),x(e.querySelector('.yt-core-attributed-string[role="text"]'))].filter(Boolean)}function Kr(e){return[...Array.from(e.querySelectorAll('a[href^="/@"],a[href^="/channel/"],a[href^="/c/"],a[href^="/user/"],a[href*="youtube.com/@"],a[href*="youtube.com/channel/"]')).flatMap(n=>[n.textContent?.trim(),n.getAttribute("href")||"",n.href||""]),x(e.querySelector(".yt-lockup-metadata-view-model-wiz__metadata")),x(e.querySelector("ytm-badge-and-byline-renderer")),x(e.querySelector("ytd-channel-name")),x(e.querySelector("#channel-name"))].filter(Boolean)}function rt(e){let t=Qr();return re(Yr(e),t.keywords)||oe(Kr(e),t.channels)||Ne(e.getAttribute("aria-label")||"",t.keywords)}function nt(e=document){Wr(),e.querySelectorAll?.(ot).forEach(t=>{t.classList.toggle(ge,rt(t))})}function $n(){nt(),window.addEventListener(Ge,()=>nt()),new MutationObserver(t=>{for(let n of t)n.addedNodes.forEach(o=>{if(o instanceof Element){o.matches(ot)&&o.classList.toggle(ge,rt(o));let r=o.closest?.(ot);r&&r.classList.toggle(ge,rt(r)),nt(o)}})}).observe(document.documentElement,{childList:!0,subtree:!0})}var R="_nou_dislike_count",at="_nou_dislike_loaded",qn="_nou_dislike_css",Jr="https://returnyoutubedislikeapi.com/votes?videoId=",be=new Map,it=new Map,H="",On=0,Gr=["dislike-button-view-model","#segmented-dislike-button"].join(","),Xr=["dislike-button-view-model button","#segmented-dislike-button button"].join(","),Zr=[".ytSpecButtonShapeNextButtonTextContent",".ytSpecButtonShapeNextButtonTextContent span",".yt-core-attributed-string",".button-renderer-text"].join(",");function ei(){return!!window.NouTube?.getSettings?.()?.showDislikes}function Vn(){let e=new URL(location.href);return e.hostname==="youtu.be"?e.pathname.split("/").filter(Boolean)[0]||"":e.pathname==="/shorts"?"":e.pathname.startsWith("/shorts/")?e.pathname.split("/")[2]||"":e.searchParams.get("v")||""}function ti(e){try{return new Intl.NumberFormat(void 0,{notation:"compact",maximumFractionDigits:1}).format(e)}catch{return String(e)}}function ni(){if(document.getElementById(qn))return;let e=document.createElement("style");e.id=qn,e.textContent=`
    .${R} {
      display: inline-flex !important;
      align-items: center !important;
      margin-left: 6px !important;
      font: inherit !important;
      font-size: 0.8em !important;
      font-weight: 400 !important;
      white-space: nowrap !important;
    }
  `,(document.head||document.documentElement).appendChild(e)}function st(){document.querySelectorAll(`.${R}`).forEach(e=>{let t=e.closest("button");t?.dataset.nouDislikeIconButton==="true"&&(t.classList.add("ytSpecButtonShapeNextIconButton"),t.classList.remove("ytSpecButtonShapeNextIconLeading"),delete t.dataset.nouDislikeIconButton);let n=e.dataset.nouOriginalText;if(n!=null&&e.dataset.nouReused==="true"){e.textContent=n,e.classList.remove(R),delete e.dataset.nouOriginalText,delete e.dataset.nouReused;return}e.remove()}),document.querySelectorAll(`.${at}`).forEach(e=>e.classList.remove(at))}function oi(e){let t=new Set(e);document.querySelectorAll(`.${R}`).forEach(n=>{let o=n.closest("button");(!o||!t.has(o))&&n.remove()})}function Un(e){let t=e.getBoundingClientRect();return t.width>0&&t.height>0}function ri(){let e=[...Array.from(document.querySelectorAll(Xr)),...Array.from(document.querySelectorAll(['button[aria-label*="Dislike"]','button[aria-label*="dislike"]','[role="button"][aria-label*="Dislike"]','[role="button"][aria-label*="dislike"]'].join(",")))];return[...new Set(e)].filter(t=>{if(!Un(t))return!1;if(t.closest(Gr))return!0;let n=`${t.getAttribute("aria-label")||""} ${t.getAttribute("title")||""}`;return/dislike/i.test(n)?!!t.closest(["ytd-segmented-like-dislike-button-renderer","segmented-like-dislike-button-view-model","ytm-slim-video-action-bar-renderer","ytm-like-button-renderer"].join(",")):!1})}function zn(e){ni();let t=ri();oi(t);for(let n of t){let o=n.querySelector(`.${R}`);if(o&&!o.classList.contains("ytSpecButtonShapeNextButtonTextContent")&&(o.remove(),o=null),!o)if(o=Array.from(n.querySelectorAll(Zr)).find(Un)||null,o)o.dataset.nouOriginalText=o.textContent||"",o.dataset.nouReused="true",o.classList.add(R);else{o=document.createElement("div"),o.className=`ytSpecButtonShapeNextButtonTextContent ${R}`;let r=n.querySelector("yt-touch-feedback-shape");n.insertBefore(o,r||null),n.classList.contains("ytSpecButtonShapeNextIconButton")&&(n.dataset.nouDislikeIconButton="true",n.classList.remove("ytSpecButtonShapeNextIconButton"),n.classList.add("ytSpecButtonShapeNextIconLeading"))}o.textContent!==e&&(o.textContent=e),n.classList.add(at)}}async function ii(e){let t=be.get(e);if(t)return t;let n=it.get(e);if(n)return n;let o=fetch(`${Jr}${encodeURIComponent(e)}`).then(async r=>{if(!r.ok)throw new Error(`Return YouTube Dislike responded with ${r.status}`);let i=await r.json(),s=typeof i?.dislikes=="number"?ti(i.dislikes):"";return s&&be.set(e,s),s}).finally(()=>it.delete(e));return it.set(e,o),o}async function X(){if(!ei()){H="",st();return}let e=Vn();if(!e){H="",st();return}let t=++On;e!==H&&(H=e,st());try{let n=await ii(e);t===On&&e===H&&n&&zn(n)}catch(n){console.warn("NouScript dislikes:",n)}}function Dn(){X(),window.addEventListener(E,X);for(let t of["yt-navigate-finish","state-navigateend","popstate"])window.addEventListener(t,X),document.addEventListener(t,X);new MutationObserver(()=>{let t=Vn();if(t&&t===H&&be.has(t)){zn(be.get(t)||"");return}X()}).observe(document.documentElement,{childList:!0,subtree:!0})}var ve="_nou_translate_btn",jn="_nou_translate_css",lt="ytm-comment-renderer, ytm-comment-thread-renderer, ytd-comment-thread-renderer, ytd-comment-view-model",Wn="#content-text, .comment-text, .comment-content, .YtmCommentRendererText, yt-attributed-string#content-text, yt-formatted-string#content-text",si=".YtmCommentRendererDetails, ytm-comment-actions, #toolbar, #action-menu",ai='<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><path d="M12.87 15.07l-2.54-2.51.03-.03c1.74-1.94 2.98-4.17 3.71-6.53H17V4h-7V2H8v2H1v1.99h11.17C11.5 7.92 10.44 9.75 9 11.35 8.07 10.32 7.3 9.19 6.69 8h-2c.73 1.63 1.73 3.17 2.98 4.56l-5.09 5.02L4 19l5-5 3.11 3.11.76-2.04zM18.5 10h-2L12 22h2l1.12-3h4.75L21 22h2l-4.5-12zm-2.62 7l1.62-4.33L19.12 17h-3.24z"/></svg>';function Qn(){return!!window.NouTube?.getSettings?.()?.translateComments}function li(){if(document.getElementById(jn))return;let e=document.createElement("style");e.id=jn,e.textContent=`
    .${ve} {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      padding: 4px 8px !important;
      margin: 0 !important;
      border: none !important;
      background: transparent !important;
      color: inherit !important;
      opacity: 0.7;
      cursor: pointer;
    }
  `,(document.head||document.documentElement).appendChild(e)}function ci(e){let t=[],n=()=>{t.length&&!t.at(-1)?.endsWith(`
`)&&t.push(`
`)},o=r=>{if(r.nodeType===Node.TEXT_NODE){let i=r.textContent?.replace(/\s+/g," ").trim();i&&t.push(i," ");return}if(r instanceof Element){if(r.tagName==="BR"){n();return}r.childNodes.forEach(o)}};return o(e),t.join("").replace(/[ \t]+\n/g,`
`).replace(/\n[ \t]+/g,`
`).replace(/[ \t]{2,}/g," ").replace(/\n{3,}/g,`

`).trim()}function ui(e){e.preventDefault(),e.stopPropagation();let o=e.currentTarget.closest(lt)?.querySelector(Wn);if(!o)return;let r=ci(o);if(r.length<2||r.length>12e3)return;let i=o.getBoundingClientRect();y("translate-block",{id:`${Date.now()}-${Math.random()}`,text:r,x:i.left,y:i.bottom})}function di(){document.querySelectorAll(`.${ve}`).forEach(e=>e.remove())}function Yn(){li(),document.querySelectorAll(lt).forEach(e=>{let t=e.querySelector(si);if(!t||t.closest(lt)!==e||t.querySelector(`.${ve}`)||!e.querySelector(Wn))return;let n=document.createElement("button");n.className=ve,n.type="button",n.setAttribute("aria-label","Translate"),n.innerHTML=g.createHTML(ai),n.addEventListener("click",ui);let o=t.querySelector(".YtmCommentRendererMenu");t.insertBefore(n,o)})}function Fn(){Qn()?Yn():di()}function Kn(){if(!window.isAndroid)return;Fn(),window.addEventListener(E,Fn);let e=!1;new MutationObserver(()=>{e||!Qn()||(e=!0,requestAnimationFrame(()=>{e=!1,Yn()}))}).observe(document.documentElement,{childList:!0,subtree:!0})}var mi=["pp","si"];function ct(e){try{let t=new URL(e);return mi.forEach(n=>t.searchParams.delete(n)),t.href}catch{return e}}function pi(){let e=document.activeElement;return e instanceof HTMLInputElement||e instanceof HTMLTextAreaElement?e.selectionStart!==null&&e.selectionEnd!==null&&e.selectionStart!==e.selectionEnd?e.value.slice(e.selectionStart,e.selectionEnd):e.value:window.getSelection()?.toString()??""}function Jn(){let e=navigator.clipboard?.writeText;e&&(navigator.clipboard.writeText=async function(t){let n=ct(t);return e.call(this,n||t)}),document.addEventListener("copy",t=>{let n=t.clipboardData?.getData("text/plain")||pi(),o=ct(n);!n||o===n||!t.clipboardData||(t.preventDefault(),t.clipboardData.setData("text/plain",o))},{capture:!0})}function Gn(e){try{return new URL(e,location.href).pathname.startsWith("/watch")}catch{return!1}}function fi(){return!!window.NouTube?.getSettings?.()?.replaceWatchNavigation}function yi(e){if(typeof e=="string"&&e)try{return new URL(e,location.href).href}catch{return location.href}return location.href}function Xn(){let e=window;if(e.__noutubeWatchNavInit)return;e.__noutubeWatchNavInit=!0;let t=history.pushState;history.pushState=function(...n){return fi()&&Gn(location.href)&&Gn(yi(n[2]))?history.replaceState.apply(this,n):t.apply(this,n)}}var ut=[{value:"auto",label:"Auto"},{value:"hd2160",label:"2160p (4K)"},{value:"hd1440",label:"1440p"},{value:"hd1080",label:"1080p"},{value:"hd720",label:"720p"},{value:"large",label:"480p"},{value:"medium",label:"360p"},{value:"small",label:"240p"},{value:"tiny",label:"144p"}];function Zn(e){let t=ut.find(n=>n.value===e);return t?t.label:"Auto"}var Se="_nou_fs_btn",P="_nou_fs_panel",ao="_nou_fs_scrim",O="_nou_lock_overlay",dt="_nou_lock_unlock",Z="_nou_fs_row",mt="_nou_fs_chip",eo="_nou_fs_slider",lo="active",to="reveal",hi="hidden",gi=3e3,co="nou:brightness",uo="nou:fsControlsSide",bi="right",vi=`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
  <path
    d="M3 17v2h6v-2H3zM3 5v2h10V5H3zm10 16v-2h8v-2h-8v-2h-2v6h2zM7 9v2H3v2h4v2h2V9H7zm14 4v-2H11v2h10zm-6-4h2V7h4V5h-4V3h-2v6z"
  ></path>
</svg>`,wi=`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
  <path
    d="M17 9V7a5 5 0 0 0-10 0v2H5v12h14V9h-2zM9 7a3 3 0 0 1 6 0v2H9V7zm8 12H7v-8h10v8z"
  ></path>
</svg>`,Si=`<svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
  <path
    d="M17 9H9V7a3 3 0 0 1 5.83-1l1.9-.62A5 5 0 0 0 7 7v2H5v12h14V9zm0 10H7v-8h10v8z"
  ></path>
</svg>`,xi=`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
  <path d="M6.99 11 3 15l3.99 4v-3H14v-2H6.99v-3zM21 9l-3.99-4v3H10v2h7.01v3L21 9z"></path>
</svg>`,_i=`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3A4.5 4.5 0 0 0 14 7.97v8.06A4.5 4.5 0 0 0 16.5 12z"></path>
</svg>`,ki=`<svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor">
  <path
    d="M12 7a5 5 0 1 0 0 10 5 5 0 0 0 0-10zm0 8a3 3 0 1 1 0-6 3 3 0 0 1 0 6zM11 1h2v3h-2V1zm0 19h2v3h-2v-3zM1 11h3v2H1v-2zm19 0h3v2h-3v-2zM4.2 5.6l1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zm12.1 12.1 1.4-1.4 2.1 2.1-1.4 1.4-2.1-2.1zM5.6 19.8l-1.4-1.4 2.1-2.1 1.4 1.4-2.1 2.1zM18.4 4.2l1.4 1.4-2.1 2.1-1.4-1.4 2.1-2.1z"
  ></path>
</svg>`,xe,mo=()=>localStorage.getItem(uo)==="right"?"right":"left";function ke(e){e?.classList.toggle(bi,mo()==="right")}function Ei(){localStorage.setItem(uo,mo()==="right"?"left":"right");for(let e of[Se,P,O])ke(document.getElementById(e))}var Ee=()=>document.fullscreenElement||document.webkitFullscreenElement,B=()=>document.getElementById("movie_player"),Te=()=>!window.isAndroid,V=()=>window.NouTubeToken||"",Ti=()=>typeof window.NouTubeI?.setBrightness=="function",po=()=>typeof window.NouTubeI?.setVolumeIndex=="function",fo=["touchstart","touchmove","touchend","touchcancel","pointerdown","pointermove","pointerup","mousedown","mouseup","click","dblclick","contextmenu","wheel"];function yo(e){e.classList.add(to),clearTimeout(xe),xe=setTimeout(()=>e.classList.remove(to),gi)}function no(e){let t=document.getElementById(O),n=document.getElementById(P);if(!t&&!n)return;let o=e.target;o instanceof Element&&o.closest(`#${P}, .${dt}`)||(e.stopImmediatePropagation(),e.cancelable&&e.preventDefault(),(e.type==="touchend"||e.type==="click")&&(n?ft():t&&yo(t)))}function pt(e){for(let t of fo)e.addEventListener(t,n=>n.stopPropagation())}function Le(e){for(let t of fo)e?document.addEventListener(t,no,{capture:!0,passive:!1}):document.removeEventListener(t,no,{capture:!0})}function ho(){clearTimeout(xe),xe=void 0,document.getElementById(O)?.remove(),document.getElementById(P)||Le(!1)}function Li(){let e=Ee();if(!e||document.getElementById(O))return;let t=document.createElement("div");t.id=O,ke(t),t.innerHTML=g.createHTML(`
    <button type="button" class="${dt}" aria-label="Unlock">${Si}</button>
  `);let n=t.querySelector(`.${dt}`);n.addEventListener("click",()=>ho()),pt(n),e.append(t),Le(!0),yo(t)}function go(){let e=Number(localStorage.getItem(co));return Number.isFinite(e)&&e>0&&e<=100?e:void 0}function Ci(){let e=go();if(e!==void 0)return e;let t=window.NouTubeI?.getBrightness?.(V());return typeof t=="number"&&t>0?Math.round(Bi(t)*100):100}var bo=.17883277,vo=.28466892,wo=.55991073;function Mi(e){let t=e<=.5?(e/.5)**2:Math.exp((e-wo)/bo)+vo;return Math.min(Math.max(t/12,0),1)}function Bi(e){let t=Math.min(Math.max(e,0),1)*12,n=t<=1?.5*Math.sqrt(t):bo*Math.log(t-vo)+wo;return Math.min(Math.max(n,0),1)}function So(e){window.NouTubeI?.setBrightness?.(V(),e>=100?-1:Mi(e/100))}function Pi(){let e=go();e!==void 0&&So(e)}function Ai(){window.NouTubeI?.setBrightness?.(V(),-1)}function Ri(){let e=window.NouTubeI?.getVolumeSteps?.(V());return typeof e=="number"&&e>0?e:0}function Ii(){let e=window.NouTubeI?.getVolumeIndex?.(V());return typeof e=="number"&&Number.isFinite(e)?e:0}var Ni=()=>typeof B()?.setVolume=="function";function Hi(){let e=B();if(e?.isMuted?.())return 0;let t=e?.getVolume?.();return typeof t=="number"&&Number.isFinite(t)?Math.round(t):100}function $i(e){let t=B();t?.setVolume?.(e),e>0&&t?.isMuted?.()&&t.unMute?.()}var xo=()=>{let e=document.querySelector("#movie_player video")||document.querySelector("video");return e instanceof HTMLVideoElement?e:null},qi=2,ee,$,oo,_e=1;function Oi(){let e=xo();if(e){if($&&oo===e)return $;try{ee||=new AudioContext;let t=ee.createMediaElementSource(e);$=ee.createGain(),t.connect($).connect(ee.destination),oo=e}catch{return}return $}}function _o(e){if(_e=e,e===1&&!$)return;let t=Oi();t&&(t.gain.value=e,ee?.resume?.())}function Vi(){if(po()){let e=Ri();return e?{native:!0,max:e,value:Ii()}:void 0}if(Te()&&Ni()){let e=Hi();return{native:!1,max:100*qi,value:e<100?e:Math.round(_e*100)}}}function Ui(e){$i(Math.min(e,100)),_o(e<=100?1:e/100)}var ro=(e,t)=>`${Math.round(po()?e/t*100:e)}%`;function zi(){let e=B()?.getAvailableQualityLevels?.(),t=Array.isArray(e)?e:[];return ut.filter(n=>n.value==="auto"||t.includes(n.value)).map(n=>n.value)}function Di(){let e=W(localStorage.getItem("nou:settings"),{});return typeof e.playbackQuality=="string"?e.playbackQuality:"auto"}function we(e){if(!e)return;let t=Number(e.min),n=Number(e.max),o=n>t?(Number(e.value)-t)/(n-t):0;e.style.setProperty("--_nou_fill",`${Math.round(o*100)}%`)}var io=(e,t,n,o)=>`
  <button
    type="button"
    class="${mt}${o?` ${lo}`:""}"
    data-group="${e}"
    data-value="${t}"
  >
    ${n}
  </button>
`;function ji(e){let t=xo(),n=t?t.playbackRate:B()?.getPlaybackRate?.(),o=typeof n=="number"&&Number.isFinite(n)?n:1,r=Di(),i=Ci(),s=Vi(),a=en(o).map(c=>io("rate",String(c),Zt(c),c===o)).join(""),l=zi().map(c=>io("quality",c,Zn(c),c===r)).join("");e.innerHTML=g.createHTML(`
    <div class="${Z}">
      ${window.isAndroid?`<button type="button" id="_nou_fs_lock">${wi}<span>Lock</span></button>`:""}
      <button type="button" id="_nou_fs_side" aria-label="Switch side">${xi}</button>
    </div>
    <div class="${Z}">
      <span class="_nou_fs_label">Speed</span>
      <div class="_nou_fs_chips">${a}</div>
    </div>
    <div class="${Z}">
      <span class="_nou_fs_label">Quality</span>
      <div class="_nou_fs_chips">${l}</div>
    </div>
    ${s?`<div class="${Z}">
          ${_i}
          <input
            class="${eo}"
            id="_nou_fs_volume"
            type="range"
            min="0"
            max="${s.max}"
            step="1"
            value="${s.value}"
          />
          <span class="_nou_fs_value" id="_nou_fs_volume_value"
            >${ro(s.value,s.max)}</span
          >
        </div>`:""}
    ${Ti()?`<div class="${Z}">
          ${ki}
          <input
            class="${eo}"
            id="_nou_fs_brightness"
            type="range"
            min="1"
            max="100"
            step="1"
            value="${i}"
          />
        </div>`:""}
  `),e.querySelector("#_nou_fs_lock")?.addEventListener("click",()=>{ft(),Li()}),e.querySelector("#_nou_fs_side").addEventListener("click",()=>Ei()),e.addEventListener("click",c=>{let m=c.target;if(!(m instanceof Element))return;let f=m.closest(`.${mt}`);if(!f)return;let{group:h,value:T}=f.dataset;if(h==="rate")B()?.setPlaybackRate?.(Number(T));else if(h==="quality"){let w=B();w?.setPlaybackQualityRange?w.setPlaybackQualityRange(T,T):w?.setPlaybackQuality?.(T)}else return;for(let w of f.parentElement.querySelectorAll(`.${mt}`))w.classList.toggle(lo,w===f)});let p=e.querySelector("#_nou_fs_volume"),d=e.querySelector("#_nou_fs_volume_value");p?.addEventListener("input",()=>{let c=Number(p.value);s?.native?window.NouTubeI?.setVolumeIndex?.(V(),c):Ui(c),we(p),d&&(d.textContent=ro(c,s.max))}),we(p);let u=e.querySelector("#_nou_fs_brightness");u?.addEventListener("input",()=>{let c=Number(u.value);localStorage.setItem(co,String(c)),So(c),we(u)}),we(u)}function ft(){document.getElementById(P)?.remove(),document.getElementById(ao)?.remove(),document.getElementById(O)||Le(!1),q()}function Fi(){let e=Ee();if(!e||document.getElementById(P))return;_e>1&&_o(_e);let t=document.createElement("div");t.id=ao;let n=document.createElement("div");n.id=P,ke(n),ji(n),pt(n),e.append(t,n),Le(!0),q()}function q(){if(!Te())return;let e=document.getElementById(Se);if(!e)return;let t=!e.matches(":hover")&&(!!document.getElementById(P)||!!B()?.classList.contains("ytp-autohide"));e.classList.toggle(hi,t)}function so(){let e=Ee();if(!e||e.querySelector(`:scope > #${Se}`))return;let t=document.createElement("button");t.id=Se,t.type="button",t.setAttribute("aria-label","Player controls"),t.innerHTML=g.createHTML(vi),ke(t),t.onclick=()=>Fi(),pt(t),Te()&&(t.addEventListener("mouseenter",()=>q()),t.addEventListener("mouseleave",()=>q())),e.append(t),q()}function ko(){let e=new MutationObserver(()=>{so(),q()}),t=()=>{let n=Ee();n?(so(),Pi(),e.observe(n,{childList:!0,subtree:!0,...Te()?{attributes:!0,attributeFilter:["class"]}:{}})):(e.disconnect(),ft(),ho(),Ai())};document.addEventListener("fullscreenchange",t),document.addEventListener("webkitfullscreenchange",t)}var Eo=()=>{if(location.pathname!=="/watch")return;let t=document.querySelector("#movie_player")?.getPlayerResponse?.()?.videoDetails?.author;t&&document.querySelectorAll("ytm-slim-video-information-renderer .slim-video-information-channel-name .ytAttributedStringHost, ytm-slim-owner-renderer .ytAttributedStringHost").forEach(n=>{if(!/%[0-9a-f]{2}/i.test(n.textContent||""))return;let o=n.querySelectorAll(":scope > span"),r=o.length>1&&o[0].textContent==="@"?o[o.length-1]:n,i=r===n?"@"+t:t;r.textContent!==i&&(r.textContent=i)})};function To(){location.host==="m.youtube.com"&&(new MutationObserver(Eo).observe(document.documentElement,{childList:!0,subtree:!0}),Eo())}var Wi=1,Qi=2,Yi=()=>window.NouTubeToken||"",U=!1,Ce=!1,Me=!1,Be=0,te=0,Lo=()=>window.NouTubeBackground===!0;function Ki(){for(let e of["ytmusic-you-there-renderer","ytm-confirm-dialog-renderer"]){let t=document.querySelector(e);if(!t)continue;let n=t.querySelectorAll("button");if(n.length===1)return n[0].click(),!0}return!1}function Co(){let e=window.NouTube;if(e&&!e.__nouGuardedPause){let t=e.pause.bind(e),n=e.play.bind(e);e.pause=()=>(U=!0,t()),e.play=()=>(U=!1,n()),e.__nouGuardedPause=!0}document.addEventListener("pause",t=>{let n=document.getElementById("movie_player");!Lo()&&t.target instanceof Node&&n?.contains(t.target)&&(U=!0)},!0);for(let t of["play","playing"])document.addEventListener(t,n=>{let o=document.getElementById("movie_player");n.target instanceof Node&&o?.contains(n.target)&&(U=!1,Ce=!0)},!0);setInterval(()=>{let t=document.getElementById("movie_player");if(!t?.getPlayerState)return;let n=t.getPlayerState();if(n===Wi){U=!1,Ce=!0,Me=!1,Be=0,te=0;return}if(!Lo()){Ce=!1,Me=!1,Be=0,te=0;return}if(n!==Qi||!Ce||U||Me||(Be++,te>=3))return;if(window.NouTubeI?.canAutoResume?.(Yi())===!1){Be>=6&&(Me=!0);return}te++;let o=Ki();C(`background guard: resuming (attempt ${te}, dialog: ${o})`),t.playVideo?.()},5e3)}function Mo(e){try{let t=new URL(e);return["http:","https:"].includes(t.protocol)&&["youtube.com","www.youtube.com","m.youtube.com"].includes(t.host)&&t.pathname==="/watch"}catch{return!1}}function Bo(e=window){Object.defineProperties(e,{outerWidth:{configurable:!0,get:()=>e.screen.width},outerHeight:{configurable:!0,get:()=>e.screen.height}})}function Po(e){let t=typeof e.composedPath=="function"?e.composedPath():[],n=e.target,o=[...t,n?.closest?.("a[href], ytm-home-logo")];for(let r of o){let i=r;if(i?.tagName==="A"){let s=i,a=s.getAttribute("href");if(a)return{href:a,target:s.target}}if(i?.tagName==="YTM-HOME-LOGO")return{href:"/"}}return null}var Ji=["m.youtube.com","www.youtube.com","youtube.com","music.youtube.com"],Gi=400,Ae=e=>Mo(e.href);function Xi(){let e=window.NouTubeRole;return e==="browse"||e==="player"?e:null}function Re(e){if(!e)return null;try{let t=new URL(e,location.href);return Ji.includes(t.host)?t:null}catch{return null}}function Io(e,t){return t==="browse"?Ae(e):!Ae(e)}function No(e,t){y(t==="browse"?"open-watch":"open-page",{url:e.href})}function Zi(e){document.addEventListener("click",t=>{if(t.defaultPrevented||t.button!==0||t.metaKey||t.ctrlKey||t.shiftKey)return;let n=Po(t);if(!n||n.target==="_blank")return;let o=Re(n.href);!o||!Io(o,e)||(t.preventDefault(),t.stopImmediatePropagation(),No(o,e))},!0)}function es(){let e=history.pushState;history.pushState=function(...t){let n=Re(typeof t[2]=="string"?t[2]:location.href),o=Re(location.href);return n&&o&&Ae(n)&&Ae(o)?history.replaceState.apply(this,t):e.apply(this,t)}}function ts(e){let t="",n=()=>{let i=Re(location.href);if(!i||!Io(i,e)){t="";return}if(i.href!==t){t=i.href,No(i,e);try{history.back()}catch{}}},o,r=()=>{clearTimeout(o);let i=location.href;o=setTimeout(()=>{location.href===i&&n()},Gi)};window.addEventListener("popstate",r),window.addEventListener("yt-navigate-finish",r),document.addEventListener("yt-navigate-finish",r);for(let i of["pushState","replaceState"]){let s=history[i];history[i]=function(...a){let l=s.apply(this,a);return r(),l}}}function Ho(e){try{let t=new URL(e,location.href),n=document.createElement("a");n.href=t.href,n.style.display="none",document.body.appendChild(n),n.click(),n.remove()}catch{location.href=e}return!0}var v="_nou_native_mini",Ao="_nou_native_mini_style",ns=`
  html.${v}, html.${v} body {
    overflow: hidden !important;
    background: #000 !important;
  }
  /* The mobile player's parent has its own stacking context. A body backdrop
     covers that entire context, regardless of the video's z-index. Hide the
     surrounding page instead, keeping the live player in its original DOM. */
  html.${v} body * {
    visibility: hidden !important;
  }
  html.${v} #movie_player,
  html.${v} #movie_player * {
    visibility: visible !important;
  }
  /* Ancestors must not clip or offset the fixed player in the small viewport. */
  html.${v} body :has(#movie_player) {
    position: static !important;
    transform: none !important;
    contain: none !important;
    overflow: visible !important;
  }
  html.${v} #movie_player {
    position: fixed !important;
    inset: 0 !important;
    width: 100vw !important;
    height: 100vh !important;
    max-width: none !important;
    max-height: none !important;
    margin: 0 !important;
    z-index: 2147483647 !important;
    background: #000 !important;
  }
  /* The player sizes its video in inline pixels, which the rule above does not
     touch, so the video has to be told to fill the box as well. */
  html.${v} #movie_player .html5-video-container,
  html.${v} #movie_player video {
    position: absolute !important;
    inset: 0 !important;
    width: 100% !important;
    height: 100% !important;
    left: 0 !important;
    top: 0 !important;
    object-fit: contain !important;
  }
  /* Controls are the app's job in the mini player: the box is too small to hit
     anything, and a tap on it means "give me the video back". */
  html.${v} #movie_player .ytp-chrome-top,
  html.${v} #movie_player .ytp-chrome-bottom,
  html.${v} #movie_player #player-control-overlay,
  html.${v} #movie_player .ytp-gradient-top,
  html.${v} #movie_player .ytp-gradient-bottom {
    display: none !important;
  }
`;function bt(e){let t=document.documentElement;if(t){if(e&&!document.getElementById(Ao)){let n=document.createElement("style");n.id=Ao,n.textContent=ns,(document.head||t).appendChild(n)}t.classList.toggle(v,!!e);try{window.dispatchEvent(new Event("resize"))}catch{}}}var Pe=!1,z=null,yt=new WeakSet;function Ro(){for(let e of Array.from(document.querySelectorAll("video, audio"))){let t=e;Pe?t.muted||(t.muted=!0,yt.add(t)):yt.has(t)&&(yt.delete(t),t.muted=!1)}}function $o(e){Pe=!!e,Ro(),Pe&&!z?(z=new MutationObserver(()=>Ro()),z.observe(document.documentElement,{childList:!0,subtree:!0})):!Pe&&z&&(z.disconnect(),z=null)}var vt=e=>e.tagName.indexOf("MINIPLAYER")!==-1||(e.getAttribute("class")||"").indexOf("iniplayer")!==-1;function ht(e){let t=e;if(!t||t.nodeType!==1||!vt(t)||!t.querySelector("video"))return!1;let n=t.getBoundingClientRect();return n.width>0&&n.height>0}var qo=new WeakSet;function gt(e){let t=e;return!t||t.nodeType!==1||!qo.has(t)?!1:Array.from(t.querySelectorAll("video")).some(n=>!n.paused)}function os(e){let t=Array.from(e.querySelectorAll('[class*="lose" i]')).filter(n=>!n.closest("#movie_player, .html5-video-player"));return t.find(n=>vt(n))||t[0]}function rs(e){let t=e,n=()=>ht(e)||gt(e);try{t.setActive?.(!1)}catch{}if(n()&&e.hasAttribute("active"))try{t.active=!1}catch{}if(n())try{(e.closest("ytd-app")||document.documentElement).dispatchEvent(new CustomEvent("yt-close-miniplayer",{bubbles:!0,composed:!0}))}catch{}if(n()&&os(e)?.click(),n()){for(let o of Array.from(e.querySelectorAll("video")))try{o.pause()}catch{}try{e.style?.setProperty("display","none","important"),qo.add(e)}catch{}}}function is(){let e=new WeakSet,t=new Set,n=i=>{if(!i)return null;for(let s of t)if(!s.isConnected)t.delete(s);else if(s===i||s.contains(i))return s;return null},o=i=>{i&&i.nodeType===1&&vt(i)&&t.add(i),!(!ht(i)&&!gt(i)||e.has(i))&&(e.add(i),requestAnimationFrame(()=>{e.delete(i),(ht(i)||gt(i))&&rs(i)}))},r=()=>{for(let i of Array.from(document.querySelectorAll("*")))o(i);new MutationObserver(i=>{for(let s of i)if(s.type==="childList"){for(let a of Array.from(s.addedNodes))o(a);o(n(s.target))}else o(s.target)}).observe(document.documentElement,{subtree:!0,childList:!0,attributes:!0,attributeFilter:["class","active","hidden","style"]}),document.addEventListener("play",i=>{o(n(i.target))},!0)};document.documentElement?r():document.addEventListener("DOMContentLoaded",r,{once:!0})}function Oo(){let e=Xi();if(!e||location.host==="music.youtube.com")return;let t=window;t.__nouSplitViewInstalled||(t.__nouSplitViewInstalled=!0,Zi(e),ts(e),e==="browse"&&is(),e==="player"&&(Bo(),es()),window.NouTubeNativeMini&&bt(!0))}try{window.NouTubePreferH264&&Rt();let e=window.NouTubeClickbaitThumbnail;e&&e!=="default"&&It(e),window.NouTube=wn(),window.NouTube.setMuted=$o,window.NouTube.setNativeMini=bt,window.NouTube.navigateWatch=Ho,Jn(),Xn(),Oo(),window.electron||Pt(),document.documentElement?(et(),Ze(),y("onload"),Vo()):document.addEventListener("DOMContentLoaded",()=>{et(),Ze(),y("onload"),Vo()}),setInterval(()=>window._lact=Date.now(),60*1e3)}catch(e){console.error("NouScript: ",e)}async function Vo(){let e=document.querySelector("#movie_player");e&&fe(e),new MutationObserver(n=>{cn(n),Cn()}).observe(document.documentElement,{childList:!0,subtree:!0}),In(),$n(),Dn(),ss(),ko(),Kn(),To(),window.isAndroid&&Co(),Nn()}function ss(){if(!window.isAndroid)return;let e=window;if(e.__noutubeDoubleTapGesturesInit)return;e.__noutubeDoubleTapGesturesInit=!0;let t=0,n=0,o=0,r=!1,i=a=>!!a.closest('input, textarea, select, button, a, video, audio, [contenteditable="true"], [role="button"],#movie_player, .html5-video-player, #player, #player-container-id, ytm-player, ytd-player, #shorts-player'),s=()=>!!(document.fullscreenElement||document.webkitFullscreenElement);document.addEventListener("touchstart",a=>{a.touches.length>1&&(r=!0)},{passive:!0,capture:!0}),document.addEventListener("touchend",a=>{if(r){a.touches.length===0&&(r=!1);return}if(a.changedTouches.length!==1)return;if(s()){t=0;return}let l=a.changedTouches[0],p=Date.now(),d=l.clientX-n,u=l.clientY-o,c=p-t<=300&&d*d+u*u<=48*48;if(t=p,n=l.clientX,o=l.clientY,!c)return;t=0;let f=(a.target instanceof Element?a.target:null)||document.elementFromPoint(l.clientX,l.clientY);if(!f||i(f))return;window.NouTube?.getSettings?.()?.doubleTapToToggleHeader&&(a.preventDefault(),y("header-double-tap"))},{passive:!1,capture:!0})}})();
