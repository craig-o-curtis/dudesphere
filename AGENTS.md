# Agent instructions

This is a vanilla Nestjs project. The goal is to setup with raw databases, no fancy ORMs.

## Language

Ensure you use the plain-english skill for all prose, commit messages, PR titles, PR descriptions, and text displayed to me. See `.agents/skills/plain-english`.

## Skills

- nestjs-best-practices: `.agents/skills/nestjs-best-practices`
- plain-english: `.agents/skills/plain-english`
- code-reviewer-nestjs: `.agents/skills/code-reviewer-nestjs`

## Git

NEVER run `git push` without asking me first and getting a yes. This holds even when the task seems to need it, such as updating a PR. Approval covers that one push only. Ask again for the next one.

## Constraints

- Use NestJS
- Use PostgreSQL
- Use TypeScript
- Use plain-english for all prose
