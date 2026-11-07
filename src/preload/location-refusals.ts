/**
 * Electron can't ask macOS whether Splash may use the location, the way it can
 * for the camera and microphone, so the only sign of a refusal is the error the
 * page gets. This passes that on and changes nothing about the request. The main
 * process decides what it means: a site Splash itself blocked gets the same error.
 *
 * Runs in the page's world, so it may use nothing from outside.
 */
export function watchLocationRefusals(report: () => void): void {
  const PERMISSION_DENIED = 1;
  // A frame its page shut out gets the same error, and macOS has no part in it.
  const shutOut = () =>
    (
      document as Document & {
        featurePolicy?: { allowsFeature(feature: string): boolean };
      }
    ).featurePolicy?.allowsFeature('geolocation') === false;
  const hearing =
    (failure?: PositionErrorCallback | null): PositionErrorCallback =>
    (error) => {
      if (error.code === PERMISSION_DENIED && !shutOut()) report();
      failure?.(error);
    };
  const { getCurrentPosition, watchPosition } = Geolocation.prototype;
  Geolocation.prototype.getCurrentPosition = function (
    this: Geolocation,
    success,
    failure,
    options,
  ) {
    getCurrentPosition.call(this, success, hearing(failure), options);
  };
  Geolocation.prototype.watchPosition = function (
    this: Geolocation,
    success,
    failure,
    options,
  ) {
    return watchPosition.call(this, success, hearing(failure), options);
  };
}
