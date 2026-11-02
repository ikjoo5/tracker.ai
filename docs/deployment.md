# GitHub Pages deployment

The project deployment target is `https://ikjoo5.github.io/tracker.ai/`. Pages hosts the static introduction, public example images/video/data, and a read-only analysis workspace. It does not run FastAPI or video inference.

The canonical repository is **ikjoo5/tracker.ai**, following the repository move reported by GitHub. The Pages workflow derives its project base path from the repository name. The root personal website remains unchanged.

## Automated deployment

[`pages.yml`](../.github/workflows/pages.yml) runs on a push to `main` or a manual workflow dispatch:

1. Set up Node.js 22 and install the lockfile with `npm ci`.
2. Validate floor projection with `npm run test:floor`.
3. Build Vite for `/tracker.ai/` in static showcase mode.
4. Upload the Pages artifact.
5. Deploy to the `github-pages` environment.

The build uses these non-secret variables:

```text
VITE_BASE_PATH=/tracker.ai/
VITE_STATIC_SHOWCASE=true
```

Images, video, records, and JavaScript bundles use `import.meta.env.BASE_URL`. The `#/workspace` route opens previously collected public records without calling the local API. It cannot upload new footage for server inference.

## First-time Pages activation

If Pages is not enabled, a repository administrator can select **Settings → Pages → Build and deployment → Source → GitHub Actions** for **`ikjoo5/tracker.ai`**. Then rerun the `Deploy project site` workflow.

Normal deployment uses the default `GITHUB_TOKEN` and does not require a personal token. First-time activation has different permissions: the [official `actions/configure-pages@v5` definition](https://github.com/actions/configure-pages/blob/v5/action.yml) states that `enablement: true` requires a token other than the default `GITHUB_TOKEN`. The workflow therefore does not attempt automatic activation.

The build job has `contents: read` and `pages: read`. Deployment uses `pages: write` and `id-token: write`. Repository or organization environment-approval rules still apply.

## Cloud network access is a separate setting

Pages activation is a **GitHub repository setting**. Allowing the agent to call GitHub’s API or verify the published URL is a **cloud environment network setting**.

The saved cloud configuration draft adds `api.github.com` and `ikjoo5.github.io` to the permitted destinations. Saving the draft does not apply it to a running instance: review and save the environment settings, then publish the cloud environment to activate that configuration. This network change grants access to those destinations; it does not modify the personal website or its repository.

Do not paste tokens into chat. Reuse the platform’s existing GitHub connection and inspect the actual failing operation before requesting additional permissions.

## Preview the deployment locally

```bash
npm ci
VITE_BASE_PATH=/tracker.ai/ VITE_STATIC_SHOWCASE=true npm run build
VITE_BASE_PATH=/tracker.ai/ npm run preview
```

Open the preview server’s `/tracker.ai/` path and check images, video, downloads, and the workspace. The demo is actual Intel store footage processed by the detector. Concept images are separately labeled and are not presented as measured output.

## Verify publication

A successful source push is not proof of website publication. Check `Deploy project site` under the repository’s **Actions**, inspect its successful deployment `page_url`, and verify the site response. Diagnose the actual failing stage: build, Pages configuration, permissions, or environment rules.

Commit `3e56c37` uploaded the initial source, pipeline documentation, and website configuration. Live publication was not confirmed while API and site requests were blocked by the cloud network policy. English branding updates do not themselves establish a successful deployment.

## Public site and local workspace

| Capability | Public Pages site | Local development |
| --- | --- | --- |
| Pipeline explanation, images, demo video | Available | Available |
| Saved public records and 3D dwell map | Read-only | Available |
| New video upload and CPU inference | Unavailable | Available through FastAPI |
| Storage of private uploaded footage | None | Local directories excluded from Git |

Publishing the inference API would require separate authentication, user data isolation, retention controls, and asynchronous job management. The Pages deployment does not expose that API.

## Preserve the personal homepage

This deployment targets only the `/tracker.ai/` project path of the **`ikjoo5/tracker.ai`** repository. It does not change the **`ikjoo5/ikjoo5.github.io`** repository, the root personal homepage, CNAME, or user-site settings.
