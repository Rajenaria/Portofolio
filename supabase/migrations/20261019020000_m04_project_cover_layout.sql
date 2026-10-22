-- M04: additive cover-card metadata only. Prepared locally; not applied remotely.
begin;
alter table public.projects
  add column cover_fit text not null default 'cover'
    constraint projects_cover_fit_check check (cover_fit in ('cover', 'contain')),
  add column cover_position_x smallint not null default 50
    constraint projects_cover_position_x_check check (cover_position_x between 0 and 100),
  add column cover_position_y smallint not null default 50
    constraint projects_cover_position_y_check check (cover_position_y between 0 and 100);
commit;
