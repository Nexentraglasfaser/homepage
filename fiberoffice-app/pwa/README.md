# FiberOffice Monteur-Web-App

Bereitstellung: https://nexentra.de/fiberoffice/monteure/

Mit `node scripts/build-installer-pwa.mjs` bauen; Inhalt von `dist-monteure/` unter `fiberoffice/monteure/` veröffentlichen. Die bestehende Portal-Anwendung bleibt unverändert bereitgestellt.

Zugang nur über bestehende freigegebene Supabase-Konten mit Rolle `installer`; Administratoren können die Monteuransicht ebenfalls öffnen. Die serverseitigen Mitgliedschafts-, Sperr- und Listenregeln bleiben maßgeblich. Keine Selbstregistrierung. Statusbearbeitung erfordert die separate Adminfreigabe.

Installation: Android/Chrome über „App installieren“ oder Browsermenü; iPhone/Safari über „Teilen“ → „Zum Home-Bildschirm“, gegebenenfalls „Als Web-App öffnen“. In WhatsApp zuerst im externen Browser öffnen. Ein Entwicklerkonto ist für die PWA nicht erforderlich.

Der Service Worker gilt nur für `/fiberoffice/monteure/`. Er speichert ausschließlich ausdrücklich aufgelistete öffentliche Programmdateien, Icons und eine statische Offline-Hilfeseite. Keine Supabase-Antworten, Kundendaten, Fotos, PDFs oder Anmeldedaten gelangen in den Service-Worker-Cache. Die Anmeldesitzung wird für erneutes Öffnen lokal gespeichert; der Schlüssel ist vom Portal getrennt. Projektdaten liegen ausschließlich im Arbeitsspeicher und werden bei jeder Aktualisierung erneut gegen Serverrechte geprüft.

Internet ist zum Abrufen und Speichern erforderlich. Es gibt keine Offline-Auftragsbearbeitung oder Upload-Warteschlange. Die Offline-Seite bestätigt keine gespeicherten Änderungen. Bei Updates wird die Oberfläche beim nächsten Online-Start neu geladen; laufende Formulare werden nicht automatisch neu geladen.

Prüfung 22.11.2026: TypeScript/Build und 144 automatisierte Tests bestanden. Zusätzliche Browserprüfungen mit fiktiven Daten für Rollen, Status-Leserechte, Suche, Handybreite, Manifest, Installierbarkeit, Service-Worker-Scope, statischen Cache und Offline-/Online-Wechsel. Physische iPhone-/Android-Installation steht als Feldtest aus.
