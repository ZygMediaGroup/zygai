# Security Policy

## Reporting a Vulnerability

Please report security issues privately to the project maintainer instead of opening a public issue.

Include:

- A short description of the issue
- Steps to reproduce
- Impact and affected configuration, if known
- Suggested fix, if you have one

## Sensitive Data

Never commit:

- `.env` or `.env.*` files, except `.env.example`
- OAuth client secret JSON files
- API keys, access tokens, private keys, or service account files
- User uploads, chat memory, vector stores, logs, or database dumps

If a secret was committed or published, remove it from history and rotate it with the provider. Removing it from the latest commit is not enough.
