<script>
import {openPtk} from 'ptk'
import {downloadToCache,ptkInCache} from 'ptk/platform/downloader.js'
import {registerServiceWorker} from 'ptk/platform/pwa.js'
import Main from 'accelon23/src/main.svelte'
import Newbie from 'accelon23/src/newbie.svelte'
import {landscape,welcoming,selectedptks,availableptks} from './appstore.js'
import {ACC23} from 'accelon23/src/appconst.js'

let loaded=false,app,bootmessage='';
registerServiceWorker();

const openptk=async name=>{
    bootmessage='try to download '+name+'.ptk'
    const res=await downloadToCache(ACC23.CacheName,name+'.ptk',msg=>{
        bootmessage=name+'.ptk '+msg;
    })
    
    const buf=await res.arrayBuffer();
    const ptk=await openPtk(name,new Uint8Array(buf));
    return ptk;
}
const init=async ()=>{
    const toload=await ptkInCache(ACC23.CacheName);
    const ptkss=$selectedptks;
    
    for (let i=0;i<ptkss.length;i++) {
        if (!~toload.indexOf(ptkss[i])) {
            toload.push(ptkss[i]);
        }
    }    
    availableptks.set(  ACC23.allptks.filter(it=>~toload.indexOf(it))); // keep the order
    app.style.height=window.innerHeight+'px';
    app.style.width=window.innerWidth+'px';   
    for (let i=0;i<toload.length;i++) {
        
        const ptk=await openptk(toload[i])
        if (toload[i]=='sz') console.log(ptk)
    }
    bootmessage='done'
    loaded=true;
}

setTimeout(()=>init(),1000); //prevent index.js:8217 Uncaught (in promise) TypeError: Cannot read properties of undefined (reading '0')
const orientation=(ls)=>{
    if (app) {
        setTimeout(()=>{
            app.style.height=window.innerHeight+'px';
            app.style.width=window.innerWidth+'px';    
        },1)
    }
}
$: orientation($landscape)
</script>
<div class="app" bind:this={app}>
{#if loaded}
{#if $welcoming}
<Newbie/>
{:else}
<Main/>
{/if}
{:else}
<span class="bodytext">
{bootmessage}
<br/>系統版本：{ACC23.AppVer} <a href="https://nissaya.cn/" target="_new">官網</a>
<br/>如果卡在此畫面沒有進度，表示瀏覽器不直持 ECMAScript 2015，無法運行本軟件。
<br/>PC及安卓請改用 Chrome 訪問本頁面。
<br/>iOS須13版以上，並使用內建的Safari。
<hr/>
</span>    

{/if}
</div>
