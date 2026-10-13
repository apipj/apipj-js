# Changelog

Todas as mudanças relevantes deste pacote. Formato baseado em [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); versões seguem [SemVer](https://semver.org/lang/pt-BR/).

## [0.1.0] - 2026-10-13

Primeira versão.

### Adicionado

- `Apipj` com `consultar` (formatos `completo` e `simplificado`; `404` vira `null`), `validar`, `status`, `planos` e `consultarVarios` (lote com limite por minuto lido de `X-RateLimit-*`, deduplicação e CNPJs inválidos pulados sem chamar a API).
- Repetição automática: `429 rate_limited` espera `Retry-After`; `5xx`, falha de rede e tempo esgotado com espera de 1 s, 2 s...
- `ApipjErro` com `status`, `code`, `message`, `retryAfter`, `upgradeUrl` e `reset`.
- Utilitários offline: `cnpjValido`, `normalizarCnpj`, `formatarCnpj`, `validarLocal`, `calcularDv` (inclusive CNPJ alfanumérico).
- Tipos TypeScript das respostas: `EmpresaCompleta`, `EmpresaSimplificada`, `Validacao`, `Status`, `Plano`, `Planos`.

[0.1.0]: https://github.com/apipj/apipj-js/releases/tag/v0.1.0
