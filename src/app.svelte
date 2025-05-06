<script>
import {registerServiceWorker} from 'ptk/platform/pwa.js'
import Main from 'accelon23/src/main.svelte'
import Newbie from 'accelon23/src/newbie.svelte'
import {landscape,welcoming} from './appstore.js'
import {ACC23} from 'accelon23/src/appconst.js'
import {init} from 'accelon23/src/appinit.js'
let loaded=false,app,bootmessage='';
if (ACC23.redbeanport!==location.port) registerServiceWorker();

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
