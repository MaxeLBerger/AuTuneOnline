# GitHub Actions Workflows

## Update Portfolio on Push

This workflow automatically triggers an update in the portfolio repository (`MaxeLBerger/MaxeLBerger.github.io`) when changes are pushed to the main branch of this repository.

### Purpose
When this repository (AuTuneOnline) is included as a submodule in your portfolio, this workflow notifies the portfolio repository to update its submodule reference.

### Setup (Optional)

This workflow is **optional**. It will only run if configured. If you don't need portfolio integration, you can ignore this workflow - it will simply be skipped.

#### To Enable This Workflow:

1. **Generate a Personal Access Token**
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Click "Generate new token (classic)"
   - Give it a name: `Portfolio Update Token`
   - Select these scopes:
     - ✅ `repo` (full control of private repositories)
     - ✅ `workflow` (update GitHub Action workflows)
   - Click "Generate token" and **copy it immediately**

2. **Add the Token to Repository Secrets**
   - Go to this repository's Settings → Secrets and variables → Actions
   - Click "New repository secret"
   - Name: `PORTFOLIO_UPDATE_TOKEN`
   - Value: Paste the token you generated
   - Click "Add secret"

3. **Update Target Repository (if different)**
   - Edit `.github/workflows/update-portfolio.yml`
   - Change `repository:` to your portfolio repository

### How It Works

When enabled, the workflow:
1. Triggers on every push to the `main` branch
2. Sends a repository dispatch event to the portfolio repository
3. The portfolio repository receives the event and can update the submodule

### Troubleshooting

**Workflow is skipped**
- This is normal if `PORTFOLIO_UPDATE_TOKEN` is not configured
- The workflow is optional and will be skipped automatically

**"Bad credentials" error**
- The token may be expired or invalid
- Generate a new token and update the secret
- Ensure the token has `repo` and `workflow` scopes

**Workflow doesn't trigger portfolio update**
- Verify the target repository has a workflow that listens for `repository_dispatch` events with `event-type: update-submodule`
- Check that the token has access to the target repository
