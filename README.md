# SEUCPC Printer Client

This is a printer-client for ICPC/CCPC-like contest in Windows.

## Instruction

To prepare packages, run

```bash
yarn
yarn run rebuild
```

To debug, run

```bash
yarn start
```

To publish, run

```bash
yarn run dist
```

## Configure

Just modify the first line of `index.js`:

```javascript
const web = '{Your own web server of SEUCPC Printer}'
```
