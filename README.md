# 平行藏

## 概要
利用網絡公開的巴利三藏及譯文，斷句並統一編號，製成平行語料庫，作為自然語言處理及機器學習的基礎數據。

## 線上演示
[平行藏手機版](https://nissaya.cn/sz/)

## 數字底本及對應存庫
- [VRI巴利三藏](https://tipitaka.org/) cs [Github存庫](https://github.com/accelon/cs)
- [SuttaCentral 英譯](https://suttacentral.net) sc [Github存庫](https://github.com/accelon/sc)
- [元亨寺 南傳大藏經](https://www.cbeta.org) cs-yh [Github存庫](https://github.com/accelon/cb-n)
- [光明寺経蔵](https://komyojikyozo.web.fc2.com/) cs-kmj [Github存庫](https://github.com/accelon/kmj)
- [巴利佛典译丛](https://github.com/sutra-mobi/nikaya/tree/master/hzfxy) cs-hz [Github存庫](https://github.com/accelon/sutra-mobi)
- [蕭式球](http://www.earlybuddhism.org.hk/?wp=3.1) cs-xsq [Github存庫](https://github.com/accelon/xsq)
- [莊春江](https://agama.buddhason.org/) cs-ccc [Github存庫](https://github.com/accelon/ccc)
- [菩提比丘](https://wisdomexperience.org/) cs-bb [Github存庫](https://github.com/accelon/bb)
- [緬譯 Tipitaka Myanmar](https://play.google.com/store/apps/details?id=mm.pndaza.tipitakamyanmar) cs-mm [Github存庫](https://github.com/accelon/cs-mm)
- 北京大學 cs-mm [Github存庫](https://github.com/accelon/cs-pku)


## 數字加工步驟
- 轉換文件格式並統一為緬甸版段落號碼。
- 逐句對齊，[對齊工具](https://accelon.github.io/aligner)
- 打包成全文數據庫
- PWA 瀏覽界面 (本程序)

## 注意事項
- 由於數據轉換之後必然有滯後性，不能立刻反映原譯作，倘若文字有出入，以原譯者網站公布為準。
- 嚴謹學術場合，請務必回查原譯文。
- 所有數據結構及轉換程序以 [Creative Common Zero](https://creativecommons.org/publicdomain/zero/1.0/deed.zh) 釋出，唯譯文必須尊重各譯者聲明的授權方式。

## 四層結構
- 第一層：長、中、相應、增支各部
- 第二層：長部及中部的經，相應部的相應，增支部的集
- 第三層：緬甸第六次結集的段落號。
- 第四層：句，平行語料的最小單元。


## deploy
    build-redbean to create dist/sz.com
    deploy sz.com and *.ptk