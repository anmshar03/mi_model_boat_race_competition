# Model Boat Race

A live dashboard for the Model Boat Race. 

## GitHub Pages

1. Open **Settings → Pages** in the [GitHub repository](https://github.com/anmshar03/mi_model_boat_race_competition).
2. Under **Build and deployment**, choose **Deploy from a branch**.
3. Select the `main` branch and `/ (root)`, then choose **Save**.
4. After GitHub finishes publishing, open [Model Boat Race](https://anmshar03.github.io/mi_model_boat_race_competition/).

The repository contains the files GitHub Pages serves directly. The `.nojekyll` file disables Jekyll processing. [GitHub Pages publishing instructions](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)

## Live workbook

The browser reads four tabs from the [tournament workbook](https://docs.google.com/spreadsheets/d/1Hg6oXqMgzrlZdsegKx95umBZLtxRMnkMWsKyolpZvxk/edit?usp=sharing). While the page is visible, it checks again 12 seconds after a successful update. Each view updates as its results arrive. If an update fails, the dashboard keeps the most recent results and retries automatically. When you return to the tab, it checks again immediately.

The workbook must allow anonymous viewing for the site to read it. Changes to the workbook appear without redeploying the site. For a different workbook, update the workbook URL and tab IDs in `sheet.js`. Keep the worksheet layouts used by the dashboard.

## Local preview

From the repository root, run `python -m http.server 8000` (or `py -m http.server 8000` on Windows) and open [localhost:8000](http://localhost:8000/). A network connection is needed to retrieve live results.
