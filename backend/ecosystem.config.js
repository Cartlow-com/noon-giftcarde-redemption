module.exports = {
  apps: [
    {
      name: 'noon-giftcard-backend',
      script: '/root/.local/bin/uv',
      args: 'run python run.py',
      cwd: '/root/noon-giftcarde-redemption/backend',
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      env: {
        PYTHONUNBUFFERED: '1',
      },
      error_file: '/root/noon-giftcarde-redemption/backend/logs/error.log',
      out_file: '/root/noon-giftcarde-redemption/backend/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
    },
  ],
};
