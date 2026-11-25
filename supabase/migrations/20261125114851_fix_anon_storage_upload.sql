-- Envio sem login (foto e termo do cadastro, antes de confirmar o e-mail) falhava sempre desde signup_guardian_term:
-- o Postgres avalia todas as policies de INSERT de storage.objects que valem para anon, e a policy
-- guardian_consents_obj_insert_signup chama can_upload_own_signup_term, que anon não podia executar
-- ("permission denied for function"), derrubando o envio inteiro, de qualquer bucket.
-- Para anon a função só devolve falso (auth.uid() é nulo), então liberar a execução não abre nada.
grant execute on function public.can_upload_own_signup_term(text) to anon;
