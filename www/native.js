/* Native bridge for Manara (Capacitor). Does nothing in a normal browser. */
(function () {
  var C = window.Capacitor;
  if (!C || !C.isNativePlatform || !C.isNativePlatform()) return;
  var P = C.Plugins, M = window.Manara;
  var isAndroid = C.getPlatform() === 'android';

  document.getElementById('bFull').hidden = true;      // no fullscreen API needed in an app
  document.getElementById('notifBox').hidden = false;  // phone notifications settings

  // Screen stays on natively (MainActivity / AppDelegate); hide the status bar
  if (P.StatusBar) P.StatusBar.hide().catch(function () {});
  if (P.SplashScreen) setTimeout(function () { P.SplashScreen.hide().catch(function () {}); }, 400);

  var LN = P.LocalNotifications;
  var busy = false, again = false;
  var KEYS = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha', 'jumua'];

  async function schedule() {
    if (!LN) return;
    if (busy) { again = true; return; }
    busy = true;
    try {
      var S = M.S;
      var pend = await LN.getPending();
      if (pend.notifications.length) {
        await LN.cancel({ notifications: pend.notifications.map(function (n) { return { id: n.id }; }) });
      }
      M.nativeNotif = false;
      if (!S.notif) return;

      var perm = await LN.checkPermissions();
      if (perm.display !== 'granted') perm = await LN.requestPermissions();
      if (perm.display !== 'granted') {
        S.notif = false;
        document.getElementById('sNotif').checked = false;
        try { localStorage.setItem('manara', JSON.stringify(S)); } catch (e) {}
        return;
      }
      if (isAndroid) {
        try { await LN.deleteChannel({ id: 'adhan' }); } catch (e) {}
        try { await LN.createChannel({ id: 'adhan_quiet_v1', name: 'الأذان (دون صوت)', description: 'يُستعمل حين يُشغَّل الأذان كاملًا من داخل التطبيق', importance: 2, visibility: 1, vibration: true }); } catch (e) {}
        for (var c of KEYS) {
          try {
            await LN.createChannel({ id: 'adhan_' + c + '_v1', name: 'أذان ' + M.NAMES[c], description: 'حان الآن موعد أذان صلاة ' + M.NAMES[c],
              importance: 5, visibility: 1, vibration: true, sound: 'adhan_' + c + '.wav' });
          } catch (e) {}
        }
      }

      // full adhan from a file plays inside the app, so the phone alert stays quiet on Android
      var quiet = S.voiceMode === 'file' && isAndroid;
      var list = [], now = Date.now(), tzMs = S.tz * 3600e3;
      for (var i = 0; i < 7; i++) {
        var base = new Date(now + tzMs + i * 86400e3);
        var y = base.getUTCFullYear(), m = base.getUTCMonth() + 1, d = base.getUTCDate();
        var fri = base.getUTCDay() === 5, t = M.computeDay(y, m, d);
        M.FARD.forEach(function (k, j) {
          var at = Date.UTC(y, m - 1, d) + t[k] * 60000 - tzMs;
          if (at <= now) return;
          var key = (fri && k === 'dhuhr') ? 'jumua' : k;
          list.push({
            id: i * 10 + j + 1,
            title: 'حان الآن موعد أذان صلاة ' + M.NAMES[key],
            body: S.name,
            sound: quiet ? undefined : 'adhan_' + key + '.wav',
            schedule: { at: new Date(at), allowWhileIdle: true },
            channelId: quiet ? 'adhan_quiet_v1' : 'adhan_' + key + '_v1'
          });
        });
      }
      if (list.length) await LN.schedule({ notifications: list });
      M.nativeNotif = true;
    } catch (e) {
      console.warn('Manara notifications:', e);
    } finally {
      busy = false;
      if (again) { again = false; schedule(); }
    }
  }

  var timer = null;
  M.onSettings = function () { clearTimeout(timer); timer = setTimeout(schedule, 1200); };
  document.addEventListener('visibilitychange', function () {
    if (document.visibilityState === 'visible') {
      schedule();
    }
  });
  schedule();
})();
