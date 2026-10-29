# 財務自由羅盤 FIRE Compass

不是「存多少錢」，而是「什麼時候可以不用再為錢工作」。

一個純前端的財務自由（FIRE）規劃工具，四個分頁：

| 分頁 | 功能 |
|---|---|
| ① 使用說明 | 三步驟上手、名詞小辭典、常見問題 |
| ② 自由試算 | 自由數字、預估自由年齡、6 個里程碑（Lean / Coast / Barista / FI / Fat FI）、一生資產曲線 |
| ③ 壓力模擬 | 1,000 次蒙地卡羅模擬，計算資產撐到預期壽命的成功率 |
| ④ 拿鐵因子 | 把固定小額支出換算成 30 年機會成本與「延後自由的時間」 |

- 所有金額以今日幣值（實質報酬）計算
- 無外部依賴、無需建置，資料只存在使用者瀏覽器（localStorage）
- 支援深色模式與手機版

## 專案結構

```
fire-compass-github/
├── public/            ← 網站本體（Cloudflare 部署這個資料夾）
│   ├── index.html
│   ├── style.css
│   ├── app.js
│   ├── favicon.svg
│   └── _headers       ← Cloudflare 安全標頭
├── wrangler.toml      ← Cloudflare 設定（指定輸出資料夾為 public）
├── .gitignore
└── README.md
```

## 本機預覽

```bash
npx serve public
```
或
```bash
python3 -m http.server 8000 -d public
```

## 一、上傳到 GitHub

**方法 A：網頁上傳（不用指令）**
1. 到 https://github.com/new 建立新 repository，例如 `fire-compass`（不要勾選新增 README）
2. 在新 repo 頁面點 **uploading an existing file**
3. 把 `fire-compass-github` 資料夾**裡面的所有東西**（`public` 資料夾、`README.md`、`wrangler.toml`、`.gitignore`）拖進去
   - `.gitignore` 是隱藏檔，Mac 在 Finder 按 `Cmd + Shift + .` 可顯示
4. 按 **Commit changes**

**方法 B：命令列**
```bash
cd fire-compass-github
git init
git add .
git commit -m "初始版本：財務自由羅盤"
git branch -M main
git remote add origin https://github.com/你的帳號/fire-compass.git
git push -u origin main
```

## 二、連接 Cloudflare Pages 自動部署

1. 登入 https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**
2. 授權 GitHub，選擇 `fire-compass` repository → **Begin setup**
3. 建置設定：

   | 欄位 | 填入 |
   |---|---|
   | Production branch | `main` |
   | Framework preset | `None` |
   | Build command | （留空） |
   | Build output directory | `public` |

4. **Save and Deploy**，完成後網址為 `https://fire-compass.pages.dev`

之後每次 push 到 `main`，Cloudflare 就會自動重新部署；推到其他分支會產生預覽網址。

> 若專案名稱不是 `fire-compass`，請把 `wrangler.toml` 的 `name` 改成一樣的名稱。

## 免責聲明

本工具以月複利、實質報酬計算，結果僅供規劃與教育參考，不構成投資建議。
