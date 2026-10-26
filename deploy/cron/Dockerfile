# Tiny image for Render cron jobs: each job just POSTs to one endpoint of the website.
# The job's Docker Command is: /bin/sh /call.sh /api/<cron path>
FROM curlimages/curl:8.10.1
COPY call.sh /call.sh
ENTRYPOINT []
CMD ["/bin/sh", "/call.sh", "/api/health"]
