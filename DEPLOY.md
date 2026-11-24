# Web UI deployment

The production Vite app is deployed as static files to Amazon S3. CloudFront provides HTTPS, caching, and a custom domain. EC2/ECR is only needed for the Go API services, not for this UI.

## GitHub environment: `mitdo-cloud`

Configure repository or environment variables:

- `AWS_REGION`
- `AWS_ROLE_ARN`
- `S3_BUCKET` — private bucket containing the `dist/` files
- `CLOUDFRONT_DISTRIBUTION_ID` — optional; required for CDN cache invalidation

`AWS_ROLE_ARN` must be assumable through GitHub OIDC and allow:

- `sts:GetCallerIdentity`
- `s3:ListBucket` and `s3:*Object` for the UI bucket
- `cloudfront:CreateInvalidation` for the distribution

The workflow builds with `npm run build`, uploads `dist/` to S3, and invalidates `/*` in CloudFront when a distribution ID is configured.

## S3 and CloudFront prerequisites

1. Create a private S3 bucket, for example `mitdo-web-ui-production`.
2. Keep block public access enabled.
3. Create a CloudFront distribution with:
   - S3 origin using Origin Access Control (OAC)
   - the bucket policy granting only the distribution access
   - default root object `index.html`
   - alternate domain names `mitdo.cloud` and `www.mitdo.cloud`
   - an ACM certificate for those domains in `us-east-1`
4. Add custom error responses:
   - HTTP 403 → `/index.html`, response 200
   - HTTP 404 → `/index.html`, response 200
5. Create Route 53 (or provider) records for the CloudFront distribution.

Vite assets are uploaded with immutable cache headers. HTML entry files are uploaded with revalidation headers.

## API routing

The production build uses same-origin paths:

- `/v1` — auth service
- `/tempo/v1` — tempo service

Configure CloudFront cache behaviors to route these paths to the API origin instead of S3. Keep `/v1/auth/google` and `/v1/auth/github` navigations on the auth service, and allow the session cookie to be sent across the same-site domain.

Do not expose auth secrets or OAuth credentials in the UI build.

## Deployment

Every push to `main` or manual `workflow_dispatch` runs `.github/workflows/deploy.yml`.

After deployment, verify:

- `/healthz` if the API service provides it
- `/` loads in a browser
- sign-in redirects and returns successfully
- tempo loading and writes work
- direct navigation to `/tempos/:id` works without a 404
