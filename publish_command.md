# Publishing Commands

## Prerequisites

1. **Build the extension first:**

   ```bash
   make build
   ```

   This will compile and create the `.vsix` file.

2. **Update version in `package.json`** before publishing a new version.

---

## VS Code Marketplace

### First-time setup

1. Create a publisher at: <https://marketplace.visualstudio.com/manage/publishers/>
2. Get a Personal Access Token (PAT) from Azure DevOps:
   - Go to <https://dev.azure.com> → Profile → Personal access tokens
   - Create token with **Marketplace > Manage** scope
3. Login:

   ```bash
   npx vsce login alexjiang
   ```

### Publish

```bash
# Publish pre-built .vsix
npx vsce publish --packagePath ralph-loop-for-antigravity-updated-<version>.vsix

# Or build and publish in one step
npx vsce publish

# Bump version and publish (patch/minor/major)
npx vsce publish patch
```

---

## Open VSX Registry

### First-time setup

1. Login at <https://open-vsx.org/> with GitHub
2. Get access token from: <https://open-vsx.org/user-settings/tokens>
3. Set environment variable (optional):

   ```bash
   export OVSX_PAT="<your-token>"
   ```

### Publish

```bash
# Publish pre-built .vsix
npx ovsx publish ralph-loop-for-antigravity-updated-<version>.vsix -p $OVSX_PAT

# Or without env var
npx ovsx publish ralph-loop-for-antigravity-updated-<version>.vsix -p <your-token>
```

---

## Full Release Workflow

```bash
# 1. Update version in package.json

# 2. Build the package
make build

# 3. Publish to VS Code Marketplace
npx vsce publish --packagePath ralph-loop-for-antigravity-<version>.vsix

# 4. Publish to Open VSX
npx ovsx publish ralph-loop-for-antigravity-updated-<version>.vsix -p $OVSX_PAT
```

---

## Troubleshooting

| Error | Solution |
|-------|----------|
| `Extension is already published` | Bump the version in `package.json` first |
| `Personal Access Token verification failed` | Regenerate PAT with correct scopes |
| `Publisher not found` | Create publisher on respective marketplace |


### Copy to Ryzen

```bash
scp ralph-loop-for-antigravity-0.4.0.vsix 192.168.3.45:/Users/agent/Downloads/
```