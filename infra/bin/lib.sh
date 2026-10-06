# Shared by infra/bin/tf, aws, check and deploy (security review 2026-09-30, I-10): the
# container CLI, the pinned AWS CLI image, the region, and the export of one profile's AWS
# login session. Sourced, never run.
# shellcheck shell=bash

# The container CLI every script runs through: $CONTAINER_CLI when set, else docker, else
# podman (an Apple silicon Mac with Podman and no Docker Desktop has no `docker`). Neither
# installed: docker, so the first call fails naming it.
container_cli() {
  if [ -n "${CONTAINER_CLI:-}" ]; then
    printf '%s' "$CONTAINER_CLI"
  elif command -v docker >/dev/null 2>&1; then
    printf docker
  elif command -v podman >/dev/null 2>&1; then
    printf podman
  else
    printf docker
  fi
}
CTR="$(container_cli)"

AWS_CLI_IMAGE=amazon/aws-cli:2.37.6
# shellcheck disable=SC2034 # read by the scripts that source this file
AWS_REGION_DEFAULT=us-east-1

# Prints the profile's session as KEY=value lines (no `export`), read by the pinned CLI
# image as the calling user, so ~/.aws never gets root-owned files.
aws_session_env() {
  local profile="$1"
  "$CTR" run --rm --user "$(id -u):$(id -g)" -e HOME=/home/aws \
    -v "$HOME/.aws:/home/aws/.aws" "$AWS_CLI_IMAGE" \
    configure export-credentials --profile "$profile" --format env-no-export
}
