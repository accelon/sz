// 產生 markdown 格式
import {nodefs, readTextLines, writeChanged,toIASTOffText, Offtext} from "../ptk/nodebundle.cjs" // assumming user has ptk installed
await nodefs
let vaultname=process.argv[2]||"ccc"
let folder="../"+vaultname+"/off"
const outfolder='sz/'+vaultname;

if (!fs.existsSync(folder)) folder="../cs-"+vaultname+"/off";
if (!fs.existsSync('sz')) fs.mkdirSync('sz');
if (!fs.existsSync(outfolder)) fs.mkdirSync(outfolder);

const files=fs.readdirSync(folder).filter(f=>f.endsWith(vaultname+".off"));

const toMarkdown=(lines)=>{
    const out=[];
    for (let i=0;i<lines.length;i++) {
        const linetext=vaultname=='cs'? toIASTOffText(lines[i]): lines[i];
        const {plain,tags}=new Offtext(linetext);
        let p=0,s='';

        if (tags.length) {
            for (let j=0;j<tags.length;j++) {
                const {choff,width}=tags[j];
                s+=plain.slice(p,choff);
                p=choff+width;
            }
            s+=plain.slice(p);
            out.push(s);
        } else {
            out.push(linetext);
        }
    }
    return out;
}
files.length=1;
files.forEach(file=>{
    const lines=readTextLines(folder+'/'+file);
    const out=toMarkdown(lines);
    writeChanged(outfolder+'/'+file.replace('.off','.md'),out.join('\n'),true);
})

