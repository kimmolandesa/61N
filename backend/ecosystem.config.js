module.exports = {
  apps: [{
    name: '61N-api',
    script: '/root/61N/api/venv/bin/uvicorn',
    args: 'main:app --host 0.0.0.0 --port 8000',
    cwd: '/root/61N/api',
    interpreter: 'none',
    autorestart: true,
    watch: false,
    max_memory_restart: '1G'
  }]
}


