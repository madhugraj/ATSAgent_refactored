# Production database protection (atsiq-db) — apply runbook

**Status: PLAN ONLY.** The product owner approved the design; **applying any
step needs their explicit OK** (prod-catch-up.md §5C). Everything here
targets the live CloudNativePG cluster `atsiq-db` (namespace `atsiq`, single
instance, 10Gi `standard-rwo`, PostgreSQL 16.4).

These files are the **reference spec** of the target state, not apply-on-sight
files: the live cluster already exists, and a full `kubectl apply` of a
Cluster manifest whose bootstrap differs from the live one risks an
unwanted re-initialisation. Every live change below is a **merge patch**.

## What this buys

| Before                                | After                                                       |
| ------------------------------------- | ----------------------------------------------------------- |
| No backup settings, no backups        | WAL archiving to `gs://atsiq/cnpg` from the moment §2 lands |
| Single instance (host-bound recovery) | Primary + hot standby (§4)                                  |
| No scheduled backups                  | Nightly base backup, `immediate: true` first shot (§5)      |
| 30d retention, **unlocked**           | Same — candidate erasure stays possible (plan rule 7)       |

## §1. One-time: the GCS credential (least privilege)

1. Create a dedicated service account and key with **objectAdmin on
   `gs://atsiq` only** (not the project):
   ```bash
   gcloud iam service-accounts create atsiq-db-backup --project=yavar-studio
   gcloud storage buckets add-iam-policy-binding gs://atsiq \
     --member="serviceAccount:atsiq-db-backup@yavar-studio.iam.gserviceaccount.com" \
     --role=roles/storage.objectAdmin
   gcloud iam service-accounts keys create /tmp/atsiq-db-backup-sa.json \
     --iam-account=atsiq-db-backup@yavar-studio.iam.gserviceaccount.com
   ```
2. Store it as the CNPG credential secret:
   ```bash
   kubectl -n atsiq create secret generic atsiq-db-backup-gcs \
     --from-file=gcsCredentials=/tmp/atsiq-db-backup-sa.json
   rm /tmp/atsiq-db-backup-sa.json
   ```
   (`10-cluster-backup.yaml` references `atsiq-db-backup-gcs` by name.)

## §2. Patch the live cluster: backups + WAL archiving

```bash
kubectl -n atsiq patch cluster.postgresql.cnpg.io atsiq-db --type=merge -p '
spec:
  backup:
    barmanObjectStore:
      destinationPath: "gs://atsiq/cnpg"
      googleCredentials:
        secret:
          name: atsiq-db-backup-gcs
      wal:
        compression: gzip
      data:
        compression: gzip
    retentionPolicy: "30d"
'
```

This restarts the primary once (CNPG enables archiving at startup). Expect a
brief switchover/RestartWatcher event; run it in the release window, not
before it.

## §3. Verify WAL archiving

```bash
kubectl -n atsiq get cluster atsiq-db -o jsonpath='{.status.walBackup.status}'
gcloud storage ls gs://atsiq/cnpg/wals/ | tail -3   # segments appearing
```

## §4. Second instance

```bash
kubectl -n atsiq patch cluster.postgresql.cnpg.io atsiq-db --type=merge -p '
spec:
  instances: 2
'
kubectl -n atsiq get pods -l cnpg.io/cluster=atsiq-db -w
```

CNPG clones the replica from the primary (streaming). Wait for
`atsiq-db-2` Ready and `status.instancesStatus` showing 2 replicas. Do this
only after §3 is green — the replica also ships its WAL.

## §5. Nightly base backup

```bash
kubectl -n atsiq apply -f apps/web/infra/cnpg/20-scheduled-backup.yaml
```

`immediate: true` takes the first base backup at once; then nightly at
03:00 UTC.

## §6. Verify a restore (quarterly, per the scouts runbook doctrine)

Point-in-time restore into a NEW cluster (never in place):

```yaml
apiVersion: postgresql.cnpg.io/v1
kind: Cluster
metadata: { name: atsiq-db-restore, namespace: atsiq }
spec:
  instances: 1
  bootstrap:
    recovery:
      source: atsiq-db
      recoveryTarget: { targetTime: "2026-11-26 06:00:00+00:00" }
  externalClusters:
    - name: atsiq-db
      barmanObjectStore:
        destinationPath: "gs://atsiq/cnpg"
        googleCredentials:
          secret: { name: atsiq-db-backup-gcs }
      wal: { compression: gzip }
```

## Connection to the catch-up release

This posture is **§5C of prod-catch-up.md**. The 2026-11-26 release still
uses the §5A hand backups (pg_dump → gs://atsiq + PVC snapshot) — this CNPG
posture is the durable follow-up, applied in its own gated window after the
release lands and the product owner signs the apply.
