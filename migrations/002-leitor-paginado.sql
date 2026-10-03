-- Migração 002 — leitor paginado + metadados de livro + textos do hero.
-- Rode no SQL Editor do Supabase (projeto letras-de-fe). Idempotente.

alter table public.livros add column if not exists autor text;
alter table public.livros add column if not exists categoria text;
alter table public.livros add column if not exists leituras int not null default 0;

alter table public.capitulos add column if not exists caracteres int not null default 0;
update public.capitulos set caracteres = length(conteudo) where caracteres = 0;

alter table public.config_site add column if not exists autora_nome text default '';
alter table public.config_site add column if not exists hero_linha1 text default 'Palavras que';
alter table public.config_site add column if not exists hero_linha2 text default 'alimentam a alma';
alter table public.config_site add column if not exists hero_frase text default 'Leia. Medite. Compartilhe.';

-- Contador de leituras: qualquer visitante pode incrementar (só de livro publicado).
create or replace function public.registrar_leitura(p_livro uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.livros set leituras = leituras + 1
  where id = p_livro and status = 'publicado';
$$;

grant execute on function public.registrar_leitura(uuid) to anon, authenticated;

-- Cor de destaque padrão nova (terracota) — só troca se ainda estiver no marrom antigo.
update public.config_site set cor_primaria = '#b5532b' where id = 1 and cor_primaria = '#8a5a3b';
alter table public.config_site alter column cor_primaria set default '#b5532b';
