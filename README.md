# Letras de Fé

Site de publicação para a autora escrever e publicar livros/textos, com leitura
pública livre (sem conta) e revisão de texto assistida por IA (só sugestões — a
autora decide o que aceitar).

Site estático (um `index.html`) + banco/autenticação no Supabase + uma função
serverless na Vercel pra revisão com IA, no mesmo espírito dos outros sites do
autor (Fala Real, Estuda Aí), reaproveitando o padrão de auth do Fala Real.

## Como funciona

- **Leitor**: entra no site, vê os livros publicados, lê os capítulos. Sem login.
- **Autora**: faz login (único papel especial, `profiles.role = 'autora'`), tem um
  Painel pra criar livros, subir capa, escrever capítulos (markdown simples),
  pedir revisão por IA e publicar.
- A IA (`api/revisar.js`, chama o Gemini) só **sugere** trechos — nunca reescreve
  o texto sozinha. A autora aceita ou ignora cada sugestão.

## Configuração (primeira vez)

### 1. Criar o projeto no Supabase

1. [supabase.com](https://supabase.com) → **New project**.
2. Abra **SQL Editor** → cole o conteúdo de `supabase-setup.sql` → **Run**.
   - **Antes de rodar**, troque `TROQUE_PARA_O_EMAIL_DA_SUA_MAE@gmail.com` (dentro
     da função `handle_new_user`) pelo e-mail real da autora. É esse e-mail que
     vira "autora" automaticamente ao criar a conta no site.
3. Em **Project Settings → API**, copie a **Project URL** e a chave **anon public**
   (ou **publishable**, nas contas novas).
4. Cole essas duas strings no topo do `index.html`, em `SUPABASE_URL` e
   `SUPABASE_ANON_KEY`.
5. Em **Project Settings → API → service_role key**, copie a chave secreta — essa
   vai **só** pra variável de ambiente da Vercel (nunca no `index.html`/navegador).

### 2. Deploy na Vercel

1. Suba este repo pro GitHub.
2. Vercel → **Add New → Project** → importe o repo. Framework **Other**, sem build.
3. Em **Environment Variables**, adicione:
   - `GEMINI_API_KEY` — chave gratuita do [Google AI Studio](https://aistudio.google.com/apikey)
     (pode reusar a mesma dos outros projetos).
   - `SUPABASE_URL` — a mesma Project URL do passo 1.
   - `SUPABASE_SERVICE_ROLE_KEY` — a service_role key do passo 1 (secreta).
4. Deploy.

### 3. A autora cria a conta

No site, a autora clica em **Entrar** (rodapé do topo) → **Criar conta** com o
e-mail que foi configurado no passo 1.3 → já entra como autora, com acesso ao Painel.

## Estrutura

```
index.html              # app inteiro (público + painel da autora)
supabase-setup.sql       # schema, RLS, trigger de bootstrap, bucket de capas
api/
  revisar.js              # endpoint serverless: revisão de texto por IA
  lib/
    supabase.js             # verifica o token da autora (service role, server-side)
    gemini.js                # chamada ao Gemini
vercel.json
manifest.webmanifest
```

## Nota sobre commits

Confira `git config user.email` antes de commitar — precisa ser o e-mail ligado
à conta GitHub usada pela Vercel pra autorizar o deploy automático.
