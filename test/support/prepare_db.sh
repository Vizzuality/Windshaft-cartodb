#!/bin/sh

# this script prepare database and redis instance to run accpetance test
#
# NOTE: assumes existance of a "template_postgis"
# NOTE2: use PG* environment variables to control who and where
#
# NOTE3: a side effect of the db preparation is the persistent creation
#        of two database roles which will be valid for the whole cluster
#        TODO: fix that
#

PREPARE_REDIS=yes
PREPARE_PGSQL=yes
DOWNLOAD_SQL_FILES=yes

while [ -n "$1" ]; do
  OPTION=$(echo "$1" | tr -d '[:space:]')
  if [[ "$OPTION" == "--skip-pg" ]]; then
    PREPARE_PGSQL=no
    shift; continue
  elif [[ "$OPTION" == "--skip-redis" ]]; then
    PREPARE_REDIS=no
    shift; continue
  elif [[ "$OPTION" == "--no-sql-download" ]]; then
    DOWNLOAD_SQL_FILES=no
    shift; continue
  else
    shift; continue;
  fi
done

die() {
        msg=$1
        echo "${msg}" >&2
        exit 1
}

# This is where postgresql connection parameters are read from
TESTENV=../../config/environments/test.js
if [ \! -r ${TESTENV} ]; then
  echo "Cannot read ${TESTENV}" >&2
  exit 1
fi

TESTUSERID=1

TESTUSER=`node -e "console.log(require('${TESTENV}').postgres_auth_user || '')"`
if test -z "$TESTUSER"; then
  echo "Missing postgres_auth_user from ${TESTENV}" >&2
  exit 1
fi
TESTUSER=`echo ${TESTUSER} | sed "s/<%= user_id %>/${TESTUSERID}/"`

TESTPASS=`node -e "console.log(require('${TESTENV}').postgres_auth_pass || 'test')"`
# TODO: should postgres_auth_pass be optional ?
if test -z "$TESTPASS"; then
  echo "Missing postgres_auth_pass from ${TESTENV}" >&2
  exit 1
fi
TESTPASS=`echo ${TESTPASS} | sed "s/<%= user_id %>/${TESTUSERID}/"`

TEST_DB="${TESTUSER}_db"

# NOTE: will be set by caller trough environment
if test -z "$REDIS_PORT"; then REDIS_PORT=6333; fi

PUBLICUSER=`node -e "console.log(require('${TESTENV}').postgres.user || 'xxx')"`
PUBLICPASS=`node -e "console.log(require('${TESTENV}').postgres.password || 'xxx')"`
echo "PUBLICUSER: ${PUBLICUSER}"
echo "PUBLICPASS: ${PUBLICPASS}"
echo "TESTUSER: ${TESTUSER}"
echo "TESTPASS: ${TESTPASS}"

if test x"$PREPARE_PGSQL" = xyes; then

  echo "preparing postgres..."
  dropdb "${TEST_DB}"
  createdb -Ttemplate_postgis -EUTF8 "${TEST_DB}" || die "Could not create test database"

  LOCAL_SQL_SCRIPTS='analysis_catalog windshaft.test gadm4 countries_null_values ported/populated_places_simple_reduced cdb_analysis_check cdb_invalidate_varnish'
  REMOTE_SQL_SCRIPTS='CDB_QueryStatements CDB_QueryTables CDB_CartodbfyTable CDB_TableMetadata CDB_ForeignTable CDB_UserTables CDB_ColumnNames CDB_ZoomFromScale CDB_OverviewsSupport CDB_Overviews CDB_QuantileBins CDB_JenksBins CDB_HeadsTailsBins CDB_EqualIntervalBins CDB_Hexagon CDB_XYZ CDB_EstimateRowCount CDB_RectangleGrid'

  if test x"$DOWNLOAD_SQL_FILES" = xyes; then
    CURL_ARGS=""
    for i in ${REMOTE_SQL_SCRIPTS}
    do
        CURL_ARGS="${CURL_ARGS}\"https://github.com/CartoDB/cartodb-postgresql/raw/master/scripts-available/$i.sql\" -o sql/$i.sql "
    done
    echo "Downloading and updating: ${REMOTE_SQL_SCRIPTS}"
    echo ${CURL_ARGS} | xargs curl -L -s
  fi

  psql -c "CREATE EXTENSION IF NOT EXISTS plpythonu;" ${TEST_DB}
  ALL_SQL_SCRIPTS="${REMOTE_SQL_SCRIPTS} ${LOCAL_SQL_SCRIPTS}"
  for i in ${ALL_SQL_SCRIPTS}
  do
    cat sql/${i}.sql |
      sed -e 's/cartodb\./public./g' -e "s/''cartodb''/''public''/g" |
      sed "s/:PUBLICUSER/${PUBLICUSER}/" |
      sed "s/:PUBLICPASS/${PUBLICPASS}/" |
      sed "s/:TESTUSER/${TESTUSER}/" |
      sed "s/:TESTPASS/${TESTPASS}/" |
      PGOPTIONS='--client-min-messages=WARNING' psql -q -v ON_ERROR_STOP=1 ${TEST_DB} > /dev/null || exit 1
  done
fi

if test x"$PREPARE_REDIS" = xyes; then

  echo "preparing redis..."

  cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
HMSET rails:users:localhost id ${TESTUSERID} \
                            database_name "${TEST_DB}" \
                            database_host localhost \
                            map_key 1234
SADD rails:users:localhost:map_key 1235
EOF

  # A user configured as with cartodb-2.5.0+
  cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
HMSET rails:users:cartodb250user id ${TESTUSERID} \
                                 database_name "${TEST_DB}" \
                                 database_host "localhost" \
                                 database_password "${TESTPASS}" \
                                 map_key 4321
EOF


  cat <<EOF | redis-cli -p ${REDIS_PORT} -n 0
HSET rails:${TEST_DB}:my_table infowindow "this, that, the other"
HSET rails:${TEST_DB}:test_table_private_1 privacy "0"
EOF

fi

# API keys ==============================

# User localhost -----------------------

# API Key Master
cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
  HMSET api_keys:localhost:1234 \
    user "localhost" \
    type "master" \
    grants_sql "true" \
    grants_maps "true" \
    database_role "${TESTUSER}" \
    database_password "${TESTPASS}"
EOF

# API Key Default public
cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
  HMSET api_keys:localhost:default_public \
    user "localhost" \
    type "default" \
    grants_sql "true" \
    grants_maps "true" \
    database_role "test_windshaft_publicuser" \
    database_password "public"
EOF

# API Key Regular
cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
  HMSET api_keys:localhost:regular1 \
    user "localhost" \
    type "regular" \
    grants_sql "true" \
    grants_maps "true" \
    database_role "test_windshaft_regular1" \
    database_password "regular1"
EOF

# API Key Regular 2 no Maps API access, only to check grants permissions to the API
cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
  HMSET api_keys:localhost:regular2 \
    user "localhost" \
    type "regular" \
    grants_sql "true" \
    grants_maps "false" \
    database_role "test_windshaft_publicuser" \
    database_password "public"
EOF

# User cartodb250user -----------------------

# API Key Master
cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
  HMSET api_keys:cartodb250user:4321 \
    user "localhost" \
    type "master" \
    grants_sql "true" \
    grants_maps "true" \
    database_role "${TESTUSER}" \
    database_password "${TESTPASS}"
EOF

# API Key Default
cat <<EOF | redis-cli -p ${REDIS_PORT} -n 5
  HMSET api_keys:cartodb250user:default_public \
    user "localhost" \
    type "default" \
    grants_sql "true" \
    grants_maps "true" \
    database_role "test_windshaft_publicuser" \
    database_password "public"
EOF


echo "Finished preparing data. Ready to run tests"
