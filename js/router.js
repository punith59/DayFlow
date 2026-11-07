const listeners = [];

export function onRouteChange(fn) {
  listeners.push(fn);
}

export function currentRoute() {
  const hash = window.location.hash.replace(/^#\/?/, "");
  const [screen, ...rest] = hash.split("/").filter(Boolean);
  return { screen: screen || "today", params: rest };
}

export function navigate(path) {
  window.location.hash = path.startsWith("/") ? path : `/${path}`;
}

window.addEventListener("hashchange", () => {
  const route = currentRoute();
  listeners.forEach((fn) => fn(route));
});

export function initRouter() {
  if (!window.location.hash) {
    window.location.hash = "/today";
  } else {
    const route = currentRoute();
    listeners.forEach((fn) => fn(route));
  }
}
