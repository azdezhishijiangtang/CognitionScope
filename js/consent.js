/* CognitionScope · local consent ledger. Personal-data outbound AI features are disabled. */
"use strict";
(function(){
 const FEATURES={delayedProbe:{label:"延迟探针",outbound:false},exportBundle:{label:"数据导出",outbound:false}};
 const scopes=new Map(); let auditSink=null;
 function attach(s){auditSink=s;}
 function log(action,feature,detail){const r={feature,action,detail:detail||{},at:Date.now()};if(auditSink)try{auditSink("consentLog",r);}catch(_){}return r;}
 function grant(feature){if(!FEATURES[feature])throw new Error("该功能未开放授权："+feature);scopes.set(feature,{scope:"until_revoked",grantedAt:Date.now(),uses:0});log("grant",feature);return{ok:true,feature};}
 function grantAll(){return Object.keys(FEATURES).map(grant);}
 function has(feature){return scopes.has(feature);}
 function consume(feature){return has(feature);}
 function revoke(feature){const existed=scopes.delete(feature);log("revoke",feature,{existed});return{ok:true,existed};}
 function revokeAll(){const n=scopes.size;scopes.clear();log("revoke_all","*",{count:n});return{ok:true,revoked:n};}
 function preview(feature,payload,opts){return{feature,bytes:new TextEncoder().encode(typeof payload==="string"?payload:JSON.stringify(payload||{})).length,outbound:false,blockers:[],note:"隐私隔离模式不允许个人数据发送给 AI 服务商"};}
 function assertBeforeCall(feature){return{allowed:false,blockers:["隐私隔离模式已关闭个人数据外发功能"],preview:preview(feature)};}
 function status(){return Object.fromEntries(Object.keys(FEATURES).map(k=>[k,{...FEATURES[k],granted:has(k)}]));}
 window.CONSENT={VERSION:"consent/7.0",FEATURES,attach,grant,has,consume,revoke,revokeAll,preview,assertBeforeCall,status,grantAll,setGlobal(){return{ok:false,note:"隐私隔离模式不存在个人数据外发授权开关"};}};
})();
