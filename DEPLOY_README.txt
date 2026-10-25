DOCUGUARD - DEPLOYMENT NOTES

This project is prepared for deployment as a Render web service with a PostgreSQL database.

Important fixes included:
- SQLAlchemy pinned to 2.0.41 (avoids the 2.1.5 version that was reinstalled by requirements.txt).
- PostgreSQL URLs normalized for the installed psycopg 3 driver.
- render.yaml blueprint added for service + database setup.
- Existing app/static/index.html, style.css and app.js use DocuGuard branding and wire Sign In/Create Account actions to the backend.

To create a public live link, the project must be deployed from a Git repository or uploaded through a hosting provider. This ZIP alone does not create a public URL.

For Render: put the extracted project in a GitHub repository, then in Render choose New > Blueprint and select that repository. Render will read render.yaml and provision the web service/database. After deploy, use the .onrender.com URL Render shows. Check /health and /health/db.

Never upload your local .env or share JWT_SECRET publicly. Generate a fresh JWT_SECRET before deployment if an old one has been exposed.
