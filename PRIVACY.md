# Privacy Policy — Ambient Canvas

Last updated: 2026-08-05

Ambient Canvas is an ambient art display for Google TV. This policy exists
because the app requests location permission, which requires a published policy
and a Data Safety declaration for Play Store distribution (INFRA-01).

## What the app collects

**Nothing is collected by us.** There is no account system, no analytics SDK, no
crash reporting service and no server operated by this project.

## What stays on your device

The following is stored locally, on the TV only, using browser local storage:

- Your display preferences (brightness, warmth, grain, fonts, timers)
- Learned picture profiles for different room lighting conditions
- The network address, name and admin credential of your paired sensor
- A randomly generated identifier for this TV, used solely so a sensor can tell
  which TV it is paired to

None of this is transmitted anywhere. Uninstalling the app removes all of it.

## Location

Location is used **only if you turn on the weather overlay**. When you do:

- The device's approximate coordinates are read once, then refreshed every
  15 minutes while the overlay is on.
- Those coordinates are sent to two third-party services to retrieve local
  conditions and a place name:
  - **Open-Meteo** (`api.open-meteo.com`) — current weather
  - **BigDataCloud** (`api.bigdatacloud.net`) — reverse geocoding
- Coordinates are never stored on disk and are never sent anywhere else.

Turning the weather overlay off stops all location access immediately. The rest
of the app is fully functional without it.

## Local network

The app communicates with your ambient sensor over your local network using
plaintext HTTP. Sensor readings — illuminance, colour temperature and motion —
never leave your network.

Discovery probes addresses on your own subnet to find the sensor. It does not
contact addresses outside your local network for this purpose.

## Artwork

The bundled artwork ships inside the app and requires no network. The curated
collection loads images from Unsplash (`images.unsplash.com`), which will see
your IP address as any website would. Local albums you choose yourself are read
from the device and never uploaded.

## Children

The app is not directed at children and collects no personal information from
anyone.

## Contact

Raise an issue on the project repository.
