begin;
create function public.ops_set_appointment_range(p_project uuid, p_start date, p_end date, p_windows text[])
returns void language plpgsql security invoker set search_path='' as $$
begin
 if p_start is null or p_end is null or not isfinite(p_start) or not isfinite(p_end) or p_end < p_start then
  raise exception 'Bitte einen gültigen Beginn und ein Ende ab diesem Tag auswählen.';
 end if;
 for offset_days in 0..(p_end - p_start) loop
  perform public.ops_set_appointment_day(p_project, p_start + offset_days, p_windows);
 end loop;
end
$$;
revoke all on function public.ops_set_appointment_range(uuid,date,date,text[]) from public,anon;
grant execute on function public.ops_set_appointment_range(uuid,date,date,text[]) to authenticated;
notify pgrst,'reload schema';
commit;
