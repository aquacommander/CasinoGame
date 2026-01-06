'use client';

import { MetaMaskLogo } from "./MetaMaskLogo";
import { MetaMaskFlaskLogo } from "./MetaMaskFlaskLogo";

import type { MetamaskState } from "../context/MetamaskContext";

import type { Snap } from "../types";
import { isLocalSnap } from "../utils/snap";
import { Button } from "../ui/button";
import { useQubicConnect } from "../context/QubicConnectContext";

export const shouldDisplayReconnectButton = (installedSnap?: Snap) => installedSnap && isLocalSnap(installedSnap?.id);

export const InstallButton = () => (
  <Button onClick={() => (window.location.href = "https://metamask.io/")}>
    <MetaMaskLogo />
    Install MetaMask
  </Button>
);

export const ConnectButton = (props: any) => {
  return (
    <Button onClick={props.onClick}>
      {props.isFlask ? <MetaMaskFlaskLogo /> : <MetaMaskLogo />}
      Connect
    </Button>
  );
};

export const ReconnectButton = (props: any) => {
  return (
    <Button onClick={props.onClick}>
      <MetaMaskFlaskLogo />
      Reconnect
    </Button>
  );
};

export const HeaderButtons = ({ state, onConnectClick }: { state: MetamaskState; onConnectClick(): unknown }) => {
  const { connected, wallet } = useQubicConnect();
  const isMetaMaskConnected = connected && wallet?.connectType === "mmSnap";

  if (!state.snapsDetected && !state.installedSnap) {
    return <InstallButton />;
  }

  if (!state.installedSnap) {
    return <ConnectButton onClick={onConnectClick} isFlask={state.isFlask} />;
  }

  if (shouldDisplayReconnectButton(state.installedSnap)) {
    return <ReconnectButton onClick={onConnectClick} />;
  }

  // Only show "Connected" if actually connected via MetaMask
  if (isMetaMaskConnected) {
    return (
      <Button disabled>
        <MetaMaskLogo /> Connected
      </Button>
    );
  }

  // If snap is installed but not connected, show connect button
  return <ConnectButton onClick={onConnectClick} isFlask={state.isFlask} />;
};

