# Web UI deployment

The production UI is deployed as static files in Amazon S3. CloudFront serves the files over HTTPS, provides caching and the custom domain, and returns the React entry document for client-side routes.

This repository does not use Docker, Nginx, ECR, EC2, or SSM for the UI. Do not use an S3 website endpoint with an arbitrary custom CNAME: the bucket name must match the hostname for that approach. The recommended architecture uses a private S3 bucket with CloudFront Origin Access Control (OAC).

## Architecture

```text
Browser
  ├── mitdo.cloud/assets/*  ──> CloudFront ──> S3 private bucket
  ├── mitdo.cloud/*         ──> CloudFront ──> S3, SPA fallback
  ├── mitdo.cloud/v1/*      ──> CloudFront ──> mdg-auth-svc
  └── mitdo.cloud/tempo/v1/* ─> CloudFront ──> mdg-tempo-svc
```

The S3 bucket is not public and static website hosting is not required.

## 1. Create the S3 bucket

Choose an arbitrary globally unique bucket name, for example:

```text
prd-mdg-web-ui
```

Do not name it after a domain unless it is intentionally an S3 website bucket.

In AWS Console:

1. Open **S3 → Create bucket**.
2. Select the deployment region, for example `ap-southeast-1`.
3. Enable **Block all public access**.
4. Enable bucket versioning if releases should be recoverable.
5. Create the bucket.

Static website hosting can remain disabled. CloudFront reads objects through OAC.

## 2. Create the ACM certificate

The ACM certificate for a CloudFront custom domain must be created in `us-east-1`.

In AWS Certificate Manager:

1. Change the region to `N. Virginia (us-east-1)`.
2. Request a public certificate.
3. Add:

```text
mitdo.cloud
*.mitdo.cloud
```

4. Complete DNS validation in your DNS provider.
5. Wait until the certificate status is `Issued`.

Use the wildcard only if subdomains such as `www.mitdo.cloud` also need HTTPS.

## 3. Create the CloudFront distribution

In AWS Console, open **CloudFront → Create distribution**:

- **Origin domain:** select the S3 REST endpoint for `prd-mdg-web-ui`, not the S3 website endpoint.
- **Origin access:** Origin access control (OAC).
- **Default root object:** `index.html`
- **Viewer protocol policy:** Redirect HTTP to HTTPS
- **Allowed HTTP methods:** `GET`, `HEAD`, `OPTIONS`
- **Alternate domain names:**

```text
mitdo.cloud
www.mitdo.cloud
```

- **Custom SSL certificate:** select the ACM certificate created in `us-east-1`.
- **Default cache behavior:** Cache policy `CachingOptimized`, or a policy that caches the static UI while not caching `/v1/*` or `/tempo/v1/*`.

After creating the distribution, copy the CloudFront distribution domain name, for example:

```text
dxxxxxxxx.cloudfront.net
```

Copy the generated bucket policy from CloudFront, then apply it to the S3 bucket under **Permissions → Bucket policy**. It should allow only the CloudFront distribution principal to call `s3:GetObject`.

Block Public Access must remain enabled.

## 4. Configure SPA routing

A React route such as `/tempos/t_dns` is not an S3 object. Configure CloudFront so missing UI paths return `index.html`:

1. Open the distribution.
2. Open **Error pages**.
3. Create a custom error response:

```text
HTTP error code: 403
Response page path: /index.html
HTTP status code: 200
```

4. Create another response:

```text
HTTP error code: 404
Response page path: /index.html
HTTP status code: 200
```

Do not add these fallbacks to API paths. API paths must use separate cache behaviors that never return `index.html` for API errors.

## 5. Configure API origins and cache behaviors

Create origin entries for the API services that are reachable by CloudFront:

- `mdg-auth-svc` origin, including Load Balancer or public API hostname
- `mdg-tempo-svc` origin, including Load Balancer or public API hostname

Add ordered cache behaviors:

```text
/v1/*       -> auth origin
/tempo/v1/* -> tempo origin
```

For APIs:

- Forward all required HTTP methods: `GET`, `HEAD`, `OPTIONS`, `POST`, `PUT`, `PATCH`, `DELETE`
- Use `CachePolicyId` for `CachingDisabled` or disable caching
- Use `OriginRequestPolicyId` for `AllViewerExceptHostHeader` if the origin does not require the viewer Host header
- Forward cookies
- Forward `Authorization` and relevant headers only if the service requires them
- Forward the `Origin` header for CORS
- If CloudFront replaces the Host header, configure a provider origin host where required

For OAuth navigation routes under `/v1/auth/google` and `/v1/auth/github`, the auth origin must receive browser requests and set the session cookie for `mitdo.cloud`.

CORS may be unnecessary for same-origin production requests when CloudFront forwards `/v1/*` and `/tempo/v1/*` to the services.

## 6. Configure DNS

In Route 53 or the DNS provider:

```text
mitdo.cloud     A  Alias to dxxxxxxxx.cloudfront.net
mitdo.cloud     AAAA Alias to dxxxxxxxx.cloudfront.net
www.mitdo.cloud A  Alias to dxxxxxxxx.cloudfront.net
www.mitdo.cloud AAAA Alias to dxxxxxxxx.cloudfront.net
```

Use Route 53 alias records for AWS. Outside Route 53, use provider-specific CNAME records where required, but do not use a CNAME for a zone apex such as `mitdo.cloud` unless the provider supports CNAME flattening.

CloudFront must include the exact custom domains in the distribution's alternate domain names.

Before CloudFront is available, an S3 website URL can be tested only with the exact bucket-name endpoint. It does not provide HTTPS and cannot serve `mitdo.cloud` unless the bucket is named `mitdo.cloud`; this repository does not use that temporary configuration for production.

## 7. Configure GitHub OIDC deployment access

In GitHub, open **Settings → Environments → mitdo-cloud** and create these environment variables:

- `AWS_REGION` — for example `ap-southeast-1`
- `AWS_ROLE_ARN` — role ARN assumed by GitHub Actions
- `S3_BUCKET` — for example `prd-mdg-web-ui`
- `CLOUDFRONT_DISTRIBUTION_ID` — the distribution ID, optional but recommended for cache invalidation

Add a GitHub OIDC provider to AWS IAM if one does not exist:

```text
Provider URL: https://token.actions.githubusercontent.com
Audience: sts.amazonaws.com
```

Create an IAM role with a trust policy restricted to this repository. Replace the placeholders:

```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Effect": "Allow",
			"Principal": {
				"Federated": "arn:aws:iam::515048575106:oidc-provider/token.actions.githubusercontent.com"
			},
			"Action": "sts:AssumeRoleWithWebIdentity",
			"Condition": {
				"StringEquals": {
					"token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
					"token.actions.githubusercontent.com:sub": "repo:mitdo-garden@346902641/mdg-web-ui@1468949773:environment:mitdo-cloud"
				}
			}
		}
	]
}
```

Attach a deployment policy restricted to the UI bucket and distribution:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "VerifyIdentity",
      "Effect": "Allow",
      "Action": "sts:GetCallerIdentity",
      "Resource": "*"
    },
    {
      "Sid": "ListWebBucket",
      "Effect": "Allow",
      "Action": "s3:ListBucket",
      "Resource": "arn:aws:s3:::prd-mdg-web-ui"
    },
    {
      "Sid": "WriteWebBucket",
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:DeleteObject",
        "s3:GetObject"
      ],
      "Resource": "arn:aws:s3:::prd-mdg-web-ui/*"
    },
    {
      "Sid": "InvalidateCloudFront",
      "Effect": "Allow",
      "Action": "cloudfront:CreateInvalidation",
      "Resource": "arn:aws:cloudfront::YOUR_ACCOUNT_ID:distribution/YOUR_DISTRIBUTION_ID"
    }
  ]
}
```

Set `AWS_ROLE_ARN` to this IAM role ARN.

## 8. Deploy from GitHub Actions

`.github/workflows/deploy.yml` runs on:

- pushes to `main`, except Markdown and CI workflow-only changes
- manual `workflow_dispatch`

The workflow:

1. Checks out the repository.
2. Installs Node 22.
3. Assumes the GitHub OIDC role.
4. Runs `npm ci`.
5. Runs `npm run build -- --mode production`.
6. Uploads `dist/` to S3 and deletes files removed from the build.
7. Reuploads hashed `dist/assets/*` files with immutable caching.
8. Invalidates `/*` in CloudFront when `CLOUDFRONT_DISTRIBUTION_ID` is configured.

Deploy manually from **Actions → deploy production S3 → Run workflow**.

## 9. Cache behavior

- `index.html` and non-hashed files: `public, max-age=0, must-revalidate`
- files under `assets/`: `public, max-age=31536000, immutable`
- `/v1/*` and `/tempo/v1/*`: disable caching

A CloudFront invalidation is necessary after publishing `index.html`. Browser revalidation is the default for HTML, but invalidation also ensures existing CloudFront edge caches remove the previous HTML immediately.

Do not invalidate S3 deployment jobs continuously for every request; invalidations are only needed after releases.

## 10. Verify the deployment

After a successful workflow run:

```bash
# Confirm DNS resolves to CloudFront
dig mitdo.cloud

# Confirm the site responds over HTTPS
curl -I https://mitdo.cloud/

# Confirm a React route is served by index.html
curl -I https://mitdo.cloud/tempos/t_dns

# Confirm static assets resolve
curl -I https://mitdo.cloud/assets/<hashed-file-name>.js

# Confirm API routing
curl -i https://mitdo.cloud/v1/me
curl -i https://mitdo.cloud/tempo/v1/map
```

In a browser:

1. Open `https://mitdo.cloud/`.
2. Sign in with Google or GitHub.
3. Confirm the OAuth callback returns to the UI.
4. Confirm `/me` is authenticated.
5. Confirm tempo list and review APIs work.
6. Open a tempo directly at `/tempos/:id`.
7. Refresh the page on `/tempos/:id`.
8. Confirm assets and API calls use `mitdo.cloud`, not localhost or an S3 URL.

## 11. Troubleshooting

### `403 AccessDenied` from CloudFront

- Confirm OAC is attached to the CloudFront origin.
- Confirm the S3 bucket policy grants that distribution access.
- Confirm the object exists in S3.
- Confirm the distribution origin uses the S3 REST domain, not the website endpoint.

### Custom domain returns `NoSuchBucket`

That endpoint is using virtual-hosted S3 website behavior and the bucket name is being treated as the domain name. Configure CloudFront and route DNS to the CloudFront distribution instead.

### Direct route returns `404`

The CloudFront distribution needs 403/404 custom error responses that return `/index.html` with HTTP 200. A CloudFront Function or Lambda@Edge is not required for this setup.

### API returns the React HTML document

The `/v1/*` and `/tempo/v1/*` CloudFront cache behaviors are missing or ordered after the default behavior. Move the API behaviors above the default behavior and exclude them from SPA error handling.

### Sign-in cookie is missing

- Set OAuth redirects to the production auth service/callback URL.
- Keep API and UI on the same-site domain.
- Confirm `mitdo_session` uses the correct domain and `Secure`, `HttpOnly`, and `SameSite` settings.
- Confirm CloudFront forwards cookies and uses no incompatible cache policy for `/v1/*`.

### The deployment succeeds but the old UI remains

Confirm `CLOUDFRONT_DISTRIBUTION_ID` is set and invalidate `/*`. If no ID is configured, set one and rerun the workflow.
