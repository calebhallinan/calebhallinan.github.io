# calebhallinan.github.io

Personal academic website for Caleb Hallinan — a Biomedical Engineering PhD candidate at Johns
Hopkins University working on machine learning and computational methods for spatial
transcriptomics, digital pathology, and tissue-scale biological analysis.

Built with [Quarto](https://quarto.org/) and deployed to GitHub Pages via GitHub Actions
(`.github/workflows/publish.yml`) on every push to `main`.

## Structure

- `index.qmd` — single-page landing (intro, research, news, publications, software, teaching,
  experience & education, contact)
- `talks.qmd` — talks and posters
- `cv.qmd` — embedded CV PDF
- `styles.css` — site theme (light, minimal, indigo accent)
- `_quarto.yml` — site config, navigation, and SEO metadata

## Local preview

```bash
quarto preview     # live-reloading local server
quarto render      # build the static site into _site/
```

## Deploy

Push to `main`; the GitHub Action runs `quarto publish gh-pages`. No manual steps required.

Live site: https://calebhallinan.github.io/
