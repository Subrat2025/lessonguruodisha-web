// One switch for every background loop in the server process (WhatsApp campaign scheduler,
// message-queue worker, Drive auto-sync). Set BACKGROUND_JOBS_DISABLED=1 on a server that must not
// send anything on its own, e.g. a new host running on a copy of the database before the domain is
// switched to it, so teachers don't get duplicate WhatsApp messages. Unset = enabled (old behaviour).
export const backgroundJobsDisabled = () => /^(1|true|yes|on)$/i.test(String(process.env.BACKGROUND_JOBS_DISABLED || '').trim())
