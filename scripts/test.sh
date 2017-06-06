#!/usr/bin/env bash
export GIT_COMMIT_SHORT=`git rev-parse --short HEAD`;
export NODE_TLS_REJECT_UNAUTHORIZED=0;
export DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )";
DOMAIN=sonicd.unstable.build

clean() {
  [[ -z "$SONICD_CONTAINER" ]] && echo "skipping rm sonicd container" || docker rm -f $SONICD_CONTAINER;
}

test_exit() {
  if [ $? -ne 0 ]; then
    echo "exit status not 0: $1"
    exit 1
  fi
}

trap 'clean' EXIT;

docker pull xarxa6/sonicd

[[ $? -ne 0 ]] && exit 1

echo "Starting WS integration spec for $GIT_COMMIT_SHORT";

SONICD_CONTAINER=$(docker run -d -v ${DIR}:/etc/sonicd:ro -p 9111:9111 xarxa6/sonicd);
test_exit $SONICD_CONTAINER
echo "deployed sonicd container: $SONICD_CONTAINER. starting tests in 5s..";
sleep 5;

cd $DIR/../ && npm install && npm test &&
  cd $DIR/../examples && npm install && node example.js
