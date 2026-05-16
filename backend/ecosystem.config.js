module.exports = {
  apps: [{
    name: 'n61-api',
    script: '/root/n61/api/venv/bin/uvicorn',
    args: 'main:app --host 0.0.0.0 --port 8000',
    cwd: '/root/n61/api',
    interpreter: 'none',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}
