copy ..\acc3x64\dist\acc3.com dist\sz.com
cd dist
@rem do not include sw.js 
zip sz.com index.css index.html index.js ProvidentPaliSegoe.otf  sz.manifest global.css sz.png sz512.png offline.html
zip sz.com -d accelon3.png accelon3_512.png
sz.com
cd ..
