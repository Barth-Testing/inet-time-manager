## Internet Manager 

## Hardware
- Fritzbox 5590 

## Software
- FritzOS
- Webinterface der Fritzbox

## Credentials
- normales Passwort im Interface notwendig für den Zugriff zur Fritzbox

## Aktuell
- Die Internetseiten für bestimmte Geräte wird über ein bestimmtes Zugangsprofil in der Fritzbox gesteuert, für dieses können Zeiten gesteuert werden in denen das Internet auf diesen Geräten zur Verfügung steht.

## Required Change
- Es soll möglich sein täglich per Eingabe in eine WebUI die Zeiten für den heutigen Tag einzugeben.
- Es soll eine maximal mögliche Stundenanzahl geben (max 3 Stunden für Tage Sonntag bis Donnerstag und 4,5 Stunden an Freitag und Samstag)
- Es sollten Zeitfenster angegeben werden können
-- es sollen mehrere Zeitfenster angegeben werden können
- Die Zeit wird für alle Zeitfenster zusammen gerechnet. Eine Umkonfiguration benötigt einen Freischaltcode
- Diese Zeiten sollen dann in der Fritzbox hinterlegt werden.
- Die Eingabe der Zeitfenster soll über ein Webinterface im Homelab ermöglicht werden.
- Die eintrtagbaren Zeiten sollen nur in den folgenden Zeiten möglich sein:
-- Sonntag bis Donnerstag 10:00 bis 21:30 
-- Freitag und Samstag 10:00 bis 23:30
- es soll einen Ferienmodus geben der dieses Zeitfenster jeden Tag ermöglicht. Dieser muss jedoch mit einem Freischaltcode vom Erwachsenen freigegeben werden und setzt das verfügbare Zeitfenster auf 10:00 bis 23:30 für alle Tage genau wie die verfügbaren Stunden auf 4,5 Stunden für alle Tage der Woche


