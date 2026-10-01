-- ============================================================
-- LETRAS DE FÉ — schema completo do Supabase
-- Rode este arquivo inteiro no SQL Editor do projeto Supabase
-- (Dashboard → SQL Editor → New query → cola tudo → Run).
--
-- IMPORTANTE: troque o e-mail dentro da função handle_new_user()
-- logo abaixo (procure TROQUE_PARA_O_EMAIL_DA_SUA_MAE) pelo e-mail
-- real da autora ANTES de rodar. É esse e-mail que vira "autora"
-- automaticamente ao criar a conta pelo site. Este arquivo roda
-- direto no SQL Editor do Supabase (cola tudo e dá Run).
-- ============================================================

-- ------------------------------------------------------------
-- EXTENSÕES
-- ------------------------------------------------------------
create extension if not exists pgcrypto;

-- ------------------------------------------------------------
-- TABELA: profiles
-- Só existe uma linha aqui: a da autora. Ninguém mais precisa
-- de profile — leitores não logam.
-- ------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  nome text,
  role text not null default 'autora' check (role in ('autora')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- ------------------------------------------------------------
-- TABELA: livros
-- ------------------------------------------------------------
create table if not exists public.livros (
  id uuid primary key default gen_random_uuid(),
  autora_id uuid not null references public.profiles(id) on delete cascade,
  titulo text not null,
  slug text not null unique,
  sinopse text default '',
  capa_url text,
  cor_destaque text default '#8a5a3b',
  status text not null default 'rascunho' check (status in ('rascunho','publicado')),
  ordem int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.livros enable row level security;

-- ------------------------------------------------------------
-- TABELA: capitulos
-- ------------------------------------------------------------
create table if not exists public.capitulos (
  id uuid primary key default gen_random_uuid(),
  livro_id uuid not null references public.livros(id) on delete cascade,
  titulo text not null,
  conteudo text not null default '',
  ordem int not null default 0,
  status text not null default 'rascunho' check (status in ('rascunho','em_revisao','publicado')),
  sugestoes_ia jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.capitulos enable row level security;

-- ------------------------------------------------------------
-- TABELA: config_site (uma linha só, id fixo = 1)
-- ------------------------------------------------------------
create table if not exists public.config_site (
  id int primary key default 1,
  nome_site text not null default 'Letras de Fé',
  subtitulo text not null default 'Reflexões e escritos sobre a Palavra',
  bio_autora text default '',
  foto_autora_url text,
  cor_primaria text not null default '#8a5a3b',
  cor_fundo text not null default '#faf6ef',
  fonte_leitura text not null default 'serif',
  updated_at timestamptz not null default now(),
  constraint config_site_singleton check (id = 1)
);

insert into public.config_site (id) values (1) on conflict (id) do nothing;

alter table public.config_site enable row level security;

-- ------------------------------------------------------------
-- HELPER: is_autora() — evita recursão de RLS em profiles
-- ------------------------------------------------------------
create or replace function public.is_autora()
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'autora'
  );
$$;

-- ------------------------------------------------------------
-- TRIGGER: cria o profile da autora automaticamente no cadastro
-- (só pro e-mail configurado; qualquer outro e-mail não vira
-- profile nenhum — logo nunca passa nas checagens de is_autora()).
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if lower(new.email) = lower('TROQUE_PARA_O_EMAIL_DA_SUA_MAE@gmail.com') then
    insert into public.profiles (id, email, nome, role)
    values (new.id, new.email, coalesce(new.raw_user_meta_data->>'nome', new.email), 'autora')
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------------------------
-- POLICIES: profiles
-- ------------------------------------------------------------
drop policy if exists "autora le proprio profile" on public.profiles;
create policy "autora le proprio profile"
  on public.profiles for select
  using (id = auth.uid());

-- ------------------------------------------------------------
-- POLICIES: livros
-- Leitura pública só do que está publicado; a autora vê e edita tudo.
-- ------------------------------------------------------------
drop policy if exists "leitura publica de livros publicados" on public.livros;
create policy "leitura publica de livros publicados"
  on public.livros for select
  using (status = 'publicado' or public.is_autora());

drop policy if exists "autora insere livros" on public.livros;
create policy "autora insere livros"
  on public.livros for insert
  with check (public.is_autora() and autora_id = auth.uid());

drop policy if exists "autora edita livros" on public.livros;
create policy "autora edita livros"
  on public.livros for update
  using (public.is_autora())
  with check (public.is_autora());

drop policy if exists "autora apaga livros" on public.livros;
create policy "autora apaga livros"
  on public.livros for delete
  using (public.is_autora());

-- ------------------------------------------------------------
-- POLICIES: capitulos
-- Leitura pública só se o capítulo E o livro-pai estiverem publicados.
-- ------------------------------------------------------------
drop policy if exists "leitura publica de capitulos publicados" on public.capitulos;
create policy "leitura publica de capitulos publicados"
  on public.capitulos for select
  using (
    public.is_autora()
    or (
      status = 'publicado'
      and exists (select 1 from public.livros l where l.id = livro_id and l.status = 'publicado')
    )
  );

drop policy if exists "autora insere capitulos" on public.capitulos;
create policy "autora insere capitulos"
  on public.capitulos for insert
  with check (public.is_autora());

drop policy if exists "autora edita capitulos" on public.capitulos;
create policy "autora edita capitulos"
  on public.capitulos for update
  using (public.is_autora())
  with check (public.is_autora());

drop policy if exists "autora apaga capitulos" on public.capitulos;
create policy "autora apaga capitulos"
  on public.capitulos for delete
  using (public.is_autora());

-- ------------------------------------------------------------
-- POLICIES: config_site
-- Todo mundo lê (o site inteiro usa isso pro tema); só autora edita.
-- ------------------------------------------------------------
drop policy if exists "leitura publica da config" on public.config_site;
create policy "leitura publica da config"
  on public.config_site for select
  using (true);

drop policy if exists "autora edita config" on public.config_site;
create policy "autora edita config"
  on public.config_site for update
  using (public.is_autora())
  with check (public.is_autora());

-- ------------------------------------------------------------
-- STORAGE: bucket de capas (leitura pública, escrita só autenticado)
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('capas', 'capas', true)
on conflict (id) do nothing;

drop policy if exists "leitura publica de capas" on storage.objects;
create policy "leitura publica de capas"
  on storage.objects for select
  using (bucket_id = 'capas');

drop policy if exists "autora envia capas" on storage.objects;
create policy "autora envia capas"
  on storage.objects for insert
  with check (bucket_id = 'capas' and public.is_autora());

drop policy if exists "autora atualiza capas" on storage.objects;
create policy "autora atualiza capas"
  on storage.objects for update
  using (bucket_id = 'capas' and public.is_autora());

drop policy if exists "autora apaga capas" on storage.objects;
create policy "autora apaga capas"
  on storage.objects for delete
  using (bucket_id = 'capas' and public.is_autora());

-- ------------------------------------------------------------
-- updated_at automático
-- ------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists livros_updated_at on public.livros;
create trigger livros_updated_at before update on public.livros
  for each row execute function public.set_updated_at();

drop trigger if exists capitulos_updated_at on public.capitulos;
create trigger capitulos_updated_at before update on public.capitulos
  for each row execute function public.set_updated_at();

drop trigger if exists config_site_updated_at on public.config_site;
create trigger config_site_updated_at before update on public.config_site
  for each row execute function public.set_updated_at();

-- ============================================================
-- PRONTO. Depois de rodar:
-- 1. Vá em Authentication → Providers → Email e confirme que
--    "Confirm email" está do jeito que você quer (pode deixar
--    OFF pra ela já entrar direto após cadastrar, numa conta só dela).
-- 2. No site, ela cria a conta uma única vez (e-mail + senha) na
--    tela de login — vira autora automaticamente pelo e-mail.
-- ============================================================
