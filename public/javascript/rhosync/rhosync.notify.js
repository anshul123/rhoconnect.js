(function($) {

    function publicInterface() {
        return {
            SyncNotify: SyncNotify
        };
    }

    var rho = RhoSync.rho;

    const action = {
        'none': 0,
        'delete': 1,
        'update': 2,
        'create': 3
    };

    function SyncNotification(url, params, removeAfterFire){
        this.url = url || '';
        this.params = params || '';
        this.removeAfterFire = removeAfterFire || false;
        if (!url) {
            url = __canonizeRhoUrl(url);
        }
    }

    function SyncNotify(engine) {

        var srcIDAndObject = {};
        var singleObjectSrcName = '';
        var singleObjectID = '';
        var hashCreateObjectErrors = {};
        var searchNotification = null;
        var syncNotifications = {};
        var allNotification = null;
        var emptyNotify = SyncNotification();
        var /*ISyncStatusListener*/ syncStatusListener = null;
        var enableReporting = false;
        var enableReportingGlobal = true;
        var strNotifyBody = "";
        var hashSrcObjectCount = {};


        SyncNotify.objectNotifyUrl = '';
        this.__defineGetter__('objectNotifyUrl', function() {
            return SyncNotify.objectNotifyUrl;
        });

        function addObjectNotify(source, objectId) {
            if ("string" == typeof source) { // if source by name
                singleObjectSrcName = source;
                singleObjectID = objectId.match(/^\{/) ? objectId.substring(1, objectId.length-2) : objectId ;
            } else { // if source by id or by reference
                var srcId = ("number" == typeof source) ? source : /*then it is an object*/ source.id;
                if (srcId) {
                    var hashObject = srcIDAndObject[srcId];
                    if (hashObject) {
                        hashObject = {};
                        srcIDAndObject[srcId] = hashObject;
                    }
                    hashObject[objectId] = action.none;
                }
            }
        }

        function cleanObjectNotifications() {
            singleObjectSrcName = "";
            singleObjectID = "";
            srcIDAndObject = {};
        }

        function cleanCreateObjectErrors() {
            hashCreateObjectErrors = {};
        }

        function processSingleObject() {
            if (!singleObjectSrcName.length) return;

            var src = engine.sources[singleObjectSrcName];
            if (src) {
                addObjectNotify(src,singleObjectID);
            }
            singleObjectSrcName = "";
            singleObjectID = "";
        }

         function fireObjectsNotification() {
            var strBody = "";
            var strUrl = "";

            if (!this.objectNotifyUrl) return;

            strUrl = __resolveUrl(this.objectNotifyUrl);

            $.each(srcIDAndObject, function(nSrcID, hashObject){
                $.each(hashObject, function(strObject, nNotifyType){

                    if (nNotifyType == action.none) return;

                    if (strBody) {
                        strBody += "&rho_callback=1&";
                    }

                    if (nNotifyType == action['delete']) {
                        strBody += "deleted[][object]=" + strObject;
                        strBody += "&deleted[][source_id]=" + nSrcID;
                    } else if (nNotifyType == action.update) {
                        strBody += "updated[][object]=" + strObject;
                        strBody += "&updated[][source_id]=" + nSrcID;
                    } else if (nNotifyType == action.create) {
                        strBody += "created[][object]=" + strObject;
                        strBody += "&created[][source_id]=" + nSrcID;
                    }

                    hashObject[strObject] = action.none;
                });
            });

            if (!strBody) return;
            callNotify(new SyncNotification(strUrl,"",false), strBody);
        }

         function onObjectChanged(srcId, objectId, type) {
            processSingleObject();

            var hashObject = srcIDAndObject[srcId];
            if (!hashObject) return;

            if(objectId in hashObject) {
                hashObject[objectId] = type;
            }
        }

        function addCreateObjectError(srcId, objectId, error) {
            var hashErrors = hashCreateObjectErrors.get(srcId);
            if ( hashErrors == null ) {
                hashErrors = {};
                hashCreateObjectErrors[srcId] = hashErrors;
            }
            hashErrors[objectId] = error;
        }

        function makeCreateObjectErrorBody(nSrcID) {
            var hashErrors = hashCreateObjectErrors[nSrcID];
            if (!hashErrors) return "";

            var strBody = "";
            $.each(srcIDAndObject, function(strObject, strError) {
                strBody += "&create_error[][object]=" + strObject;
                strBody += "&create_error[][error_message]=" + strError;
            });
            return strBody;
        }

         function onSyncSourceEnd(nSrc, sources) {
            var src = sources[nSrc];

            if (engine.getState() == engine.states.stop && src.errCode != rho.errors.ERR_NONE) {
                var pSN = getSyncNotifyBySrc(src);
                if (pSN != null) {
                    fireSyncNotification(src, true, src.errCode, "");
                } else {
                    fireAllSyncNotifications(true, src.errCode, src.error, "");
                }
            }
            else
                fireSyncNotification(src, true, src.errCode, "");

            cleanCreateObjectErrors();
        }

        function setSyncNotification(srcId, notification) {
            //LOG.INFO("Set notification. Source ID: " + source_id + ";" + (pNotify != null? pNotify.toString() : "") );
            if (srcId == -1) {
                allNotification = notification;
            } else {
                syncNotifications[srcId] = notification;
            }
        }

        function setSearchNotification(strUrl, strParams ) {
            //LOG.INFO( "Set search notification. Url :" + strUrl + "; Params: " + strParams );
            var strFullUrl = __resolveUrl(strUrl);
            if (strFullUrl) {
                searchNotification = new SyncNotification(strFullUrl, strParams, true);
                //LOG.INFO( " Done Set search notification. Url :" + strFullUrl + "; Params: " + strParams );
            }
        }

        function setSyncStatusListener(listener) {
                syncStatusListener = listener;
        }


        function reportSyncStatus(status, errCode, details) {
            if (syncStatusListener != null
                    && (isReportingEnabled() || errCode == rho.errors.ERR_SYNCVERSION)) {
                if (errCode == rho.errors.ERR_SYNCVERSION) {
                    status = __getErrorText(errCode);
                } else {
                    details = details || __getErrorText(errCode);
                    status += (details.length() > 0 ? __getMessageText("details") + details: "");
                }
                //LOG.INFO("Status: "+strStatus); //TODO: to implement log
                //syncStatusListener.reportStatus(status, errCode); //TODO: to implement statusListener
            }
        }

/*
        void fireBulkSyncNotification( boolean bFinish, String status, String partition, int nErrCode )
        {
            if ( getSync().getState() == SyncEngine.esExit )
                return;

            if( nErrCode != RhoAppAdapter.ERR_NONE)
            {
                String strMessage = RhoAppAdapter.getMessageText("sync_failed_for") + "bulk.";
                reportSyncStatus(strMessage,nErrCode,"");
            }

            String strParams = "";
            strParams += "partition=" + partition;
            strParams += "&bulk_status="+status;
            strParams += "&sync_type=bulk";

            doFireSyncNotification( null, bFinish, nErrCode, "", strParams, "" );
        }
*/

        function fireAllSyncNotifications(isFinish, errCode, error, serverError ) {
            if (engine.getState() == engine.states.exit) return;

            if(errCode != rho.errors.ERR_NONE) {
                if (!engine.isSearch()) {
                    var strMessage = __getMessageText("sync_failed_for") + "all.";
                    reportSyncStatus(strMessage,errCode,error);
                }
            }
            var sn = getSyncNotifyBySrc(null);
            if (sn) {
                doFireSyncNotification(null, isFinish, errCode, error, "", serverError);
            }
        }

        function fireSyncNotification(src, isFinish, errCode, message ) {
            if (engine.getState() == engine.states.exit) return;

            if (message.length() > 0 || errCode != rho.errors.ERR_NONE) {
                if (!engine.isSearch()) {
                    if (src != null && (message==null || message.length() == 0) )
                        message = __getMessageText("sync_failed_for") + src.getName() + ".";

                    reportSyncStatus(message, errCode, src != null ? src.error : "");
                }
            }
            doFireSyncNotification(src, isFinish, errCode, "", "", "" );
        }

        function getSyncNotifyBySrc(src) {
            var sn = null; // sync notification
            if (engine.isSearch()) {
                sn = searchNotification;
            } else {
                if (src != null) sn = syncNotifications[src.id];
                if (sn == null) sn = allNotification;
            }
            if (sn == null && !engine.isNoThreadedMode()) return null;
            return sn != null ? sn : emptyNotify;
        }

        function doFireSyncNotification(src, bFinish, nErrCode, strError, strParams, strServerError) {
            //TODO: to implement
        }

        function callNotify(oNotify, strBody) {
            if (engine.isNoThreadedMode()) {
                strNotifyBody = strBody;
                return false;
            }
            if (!oNotify.url) return true;

            //TODO: implement real notification here!
            //NetResponse resp = getNet().pushData( oNotify.m_strUrl, strBody, null );
            //if ( !resp.isOK() )
            //    LOG.ERROR( "Fire object notification failed. Code: " + resp.getRespCode() + "; Error body: " + resp.getCharData() );
            //else
            //{
            //    String szData = resp.getCharData();
            //    return szData != null && szData.equals("stop");
            //}

            return true;
        }

        function clearNotification(src) {
            //LOG.INFO( "Clear notification. Source : " + (src != null ? src.name() : "" ) );
            if (engine.isSearch()) searchNotification = null;
            else syncNotifications[src.id] = null;
        }

        function clearSyncNotification(source_id) {
            //LOG.INFO( "Clear notification. Source ID: " + source_id );
            if (source_id == -1) allNotification = null; //Clear all
            else syncNotifications[source_id] = null;
        }

        function cleanLastSyncObjectCount() {
            hashSrcObjectCount = {};
        }

        function incLastSyncObjectCount(nSrcID) {
            var nCount = hashSrcObjectCount[nSrcID] || 0;
            nCount += 1;

            hashSrcObjectCount[nSrcID] = nCount;

            return nCount || 0;
        }

        function getLastSyncObjectCount(nSrcID) {
            return hashSrcObjectCount[nSrcID] || 0;
        }


        function callLoginCallback(oNotify, nErrCode, strMessage) {
            //try {
                if (engine.isStopedByUser())
                    return;

                var strBody = "error_code=" + nErrCode;

                strBody += "&error_message=" + __urlEncode(strMessage != null? strMessage : "");
                strBody += "&rho_callback=1";

                //LOG.INFO( "Login callback: " + oNotify.toString() + ". Body: "+ strBody );

                callNotify(oNotify, strBody);
            //} catch (Exception exc) {
            //    //LOG.ERROR("Call Login callback failed.", exc);
            //}
        }

        function isReportingEnabled() {
            return enableReporting && enableReportingGlobal;
        }

    }

    function __getErrorText(key) {
        //TODO: to implement
    }

    function __getMessageText(key) {
        //TODO: to implement
    }

    function __getHomeUrl() {
        //TODO: to implement
        return "";
    }
    function __isExternalUrl() {
        //TODO: to implement
        return false;
    }

    function __canonizeRhoUrl(url) {
        //TODO: to implement
/*
        var strUrl = url;
            if (!url)
                return __getHomeUrl();
            strUrl = strUrl.replace('\\', '/');
            if ( !strUrl.startsWith(getHomeUrl()) && !isExternalUrl(strUrl) )
                strUrl = FilePath.join(getHomeUrl(), strUrl);
        return strUrl;
*/
        return url;
    }

    function __resolveUrl(url) {
        return url;
    }

    function __urlEncode(param) {
    }

    $.extend(rho, {notify: publicInterface()});

})(jQuery);