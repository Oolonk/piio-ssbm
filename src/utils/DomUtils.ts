import '../../src/shared/types/dom-extensions.d.ts';

interface CreateElementParams {
  type?: string;
  className?: string;
  text?: string;
  id?: string;
  append?: Node | null;
  prepend?: Node | null;
  onclick?: ((e: MouseEvent) => void) | null;
}

export function createElement(params: CreateElementParams): HTMLElement {
  const {
    type = 'div',
    className = '',
    text = '',
    id = '',
    append = null,
    prepend = null,
    onclick = null,
  } = params;

  const el = document.createElement(type);
  el.className = className;
  el.id = id;
  if (text) el.innerText = text;
  if (append !== null) el.appendChild(append);
  if (prepend !== null) el.prepend(prepend);
  if (onclick) (el as HTMLElement).onclick = onclick;
  return el;
}

export function fileExists(file: string): Promise<boolean> {
  const fs = require('fs') as typeof import('fs');
  return new Promise((resolve) =>
    fs.access(file, fs.constants.F_OK, (err) => resolve(!err))
  );
}

export function deepValue(obj: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce((acc: unknown, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

export function getInterfaces(): Array<{
  address: string;
  netmask: string;
  base: string;
  broadcast: string;
  [key: string]: unknown;
}> {
  const os = require('os') as typeof import('os');
  const ifaces = os.networkInterfaces();
  const ips: ReturnType<typeof getInterfaces> = [];
  Object.values(ifaces).forEach((ifaceList) => {
    (ifaceList ?? []).forEach((iface) => {
      if (iface.family !== 'IPv4' || iface.internal) return;
      if (ips.some((x) => x.address === iface.address)) return;
      const range = getIpRange(iface.address, iface.netmask);
      ips.push({ ...iface, base: range[0], broadcast: range[1] });
    });
  });
  return ips;
}

function getIpRange(ip: string, mask: string): [string, string] {
  const ipParts = ip.split('.').map(Number);
  const maskParts = mask.split('.').map(Number);
  const base = ipParts.map((b, i) => b & maskParts[i]).join('.');
  const broadcast = ipParts
    .map((b, i) => b | (maskParts[i] ^ 255))
    .join('.');
  return [base, broadcast];
}

export async function getCPUUsage(): Promise<number> {
  const start = readCPU();
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const end = readCPU();
  const total = end.total - start.total;
  const idle = end.idle - start.idle;
  return 1 - idle / total;
}

function readCPU(): { total: number; idle: number } {
  const os = require('os') as typeof import('os');
  let total = 0;
  let idle = 0;
  os.cpus().forEach((core) => {
    total +=
      core.times.user +
      core.times.nice +
      core.times.sys +
      core.times.irq +
      core.times.idle;
    idle += core.times.idle;
  });
  return { total, idle };
}

export function installDomPrototypes(): void {
  HTMLInputElement.prototype.insertValue = function (val: string): void {
    const start = this.selectionStart ?? 0;
    const end = this.selectionEnd ?? 0;
    this.value = val ?? '';
    this.selectionStart = start;
    this.selectionEnd = end;
  };

  HTMLElement.prototype.truncate = function (): typeof this {
    while (this.firstChild) this.removeChild(this.firstChild);
    return this;
  };

  HTMLElement.prototype.getIndex = function (): number {
    return Array.prototype.slice
      .call(this.parentNode?.children ?? [])
      .indexOf(this);
  };

  HTMLElement.prototype.getIndexIn = function (parent: HTMLElement): number {
    let child: Element = this;
    while (parent !== child.parentElement) {
      child = child.parentElement!;
    }
    return Array.prototype.slice.call(parent.children).indexOf(child);
  };
}
