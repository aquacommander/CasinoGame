'use client';

import { generateQRCode } from "../utils";
import { AnimatePresence, motion } from "framer-motion";
import { useContext, useEffect, useState } from "react";
import { IoClose } from "react-icons/io5";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { Input } from "../ui/input";
import { HeaderButtons } from "./Buttons";
import { MetaMaskContext } from "../context/MetamaskContext";
import { useQubicConnect } from "../context/QubicConnectContext";
import { Account } from "../types";
import { useWalletConnect } from "../context/WalletConnectContext";
import AccountSelector from "../ui/AccountSelector";
import { MetaMaskLogo } from "./MetaMaskLogo";
import { WalletConnectLogo } from "./WalletConnectLogo";

export enum MetamaskActions {
  SetInstalled = "SetInstalled",
  SetSnapsDetected = "SetSnapsDetected",
  SetError = "SetError",
  SetIsFlask = "SetIsFlask",
}

const ConnectModal = ({ open, onClose, darkMode }: { open: boolean; onClose: () => void; darkMode?: boolean }) => {
  const [state] = useContext(MetaMaskContext);

  const [selectedMode, setSelectedMode] = useState("none");
  // Private seed handling
  const [privateSeed, setPrivateSeed] = useState("");
  const [errorMsgPrivateSeed, setErrorMsgPrivateSeed] = useState("");
  // Vault file handling
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [password, setPassword] = useState("");
  // Context connect handling
  const { connect, disconnect, connected, mmSnapConnect, privateKeyConnect, vaultFileConnect } = useQubicConnect();
  // account selection
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = useState(0);
  // WC
  const [qrCode, setQrCode] = useState<string>("");
  const [connectionURI, setConnectionURI] = useState<string>("");
  const { connect: walletConnectConnect, isConnected, requestAccounts, disconnect: walletConnectDisconnect } = useWalletConnect();

  const modalVariants = {
    hidden: { opacity: 0, scale: 0.9 },
    visible: { opacity: 1, scale: 1 },
    exit: { opacity: 0, scale: 0.9 },
  };

  const overlayVariants = {
    hidden: { opacity: 0 },
    visible: { opacity: 1 },
    exit: { opacity: 0 },
  };

  const contentVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -20 },
  };

  const generateURI = async () => {
    try {
      // Reset previous state
      setQrCode("");
      setConnectionURI("");
      
      const { uri, approve } = await walletConnectConnect();
      if (uri && uri.trim() !== "") {
        setConnectionURI(uri);
        try {
          // Generate QR code - this should work in both dev and production
          const result = await generateQRCode(uri);
          setQrCode(result);
          
          // Start the approval process (this waits for user to scan and approve)
          // Don't await it - let it run in background
          approve().catch((error) => {
            console.error("WalletConnect approval error:", error);
            // Reset state on error
            setQrCode("");
            setConnectionURI("");
          });
        } catch (qrError) {
          console.error("Error generating QR code:", qrError);
          // Retry QR code generation with a small delay
          setTimeout(async () => {
            try {
              const result = await generateQRCode(uri);
              setQrCode(result);
              // Start approval after successful QR generation
              approve().catch((error) => {
                console.error("WalletConnect approval error:", error);
                setQrCode("");
                setConnectionURI("");
              });
            } catch (retryError) {
              console.error("Retry QR code generation failed:", retryError);
            }
          }, 500);
        }
      } else {
        console.error("WalletConnect URI is empty");
      }
    } catch (error) {
      console.error("Error generating WalletConnect URI:", error);
    }
  };

  useEffect(() => {
    if (isConnected) {
      const fetchAccounts = async () => {
        try {
          const accounts = await requestAccounts();
          setAccounts(
            accounts.map((account) => ({
              publicId: account.address,
              alias: account.name,
            })),
          );
          setSelectedMode("account-select");
        } catch (error) {
          console.error("Error fetching accounts:", error);
        }
      };
      fetchAccounts();
    }
  }, [isConnected, requestAccounts]);

  // Reset state when modal closes
  useEffect(() => {
    if (!open) {
      setSelectedMode("none");
      setQrCode("");
      setConnectionURI("");
      setAccounts([]);
      setSelectedAccount(0);
      setPrivateSeed("");
      setErrorMsgPrivateSeed("");
      setSelectedFile(null);
      setPassword("");
    }
  }, [open]);

  // check if input is valid seed (55 chars and only lowercase letters)
  const privateKeyValidate = (pk: string) => {
    if (pk.length !== 55) {
      setErrorMsgPrivateSeed("Seed must be 55 characters long");
    }
    if (pk.match(/[^a-z]/)) {
      setErrorMsgPrivateSeed("Seed must contain only lowercase letters");
    }
    if (pk.length === 55 && !pk.match(/[^a-z]/)) {
      setErrorMsgPrivateSeed("");
    }
    setPrivateSeed(pk);
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setSelectedFile(file || null);
  };
  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) =>
    setPassword(event.target.value.toString());

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed left-0 top-0 z-50 flex h-full w-full overflow-y-auto overflow-x-hidden p-5 bg-black/60 backdrop-blur-sm"
          onClick={() => {
            setSelectedMode("none");
            setQrCode("");
            setConnectionURI("");
            setAccounts([]);
            setSelectedAccount(0);
            onClose();
          }}
          variants={overlayVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <motion.div
            className="relative m-auto flex w-full max-w-md flex-col"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
            onClick={(e: React.MouseEvent<HTMLDivElement>) => e.stopPropagation()}
          >
            <Card className="bg-gray-900 p-8 text-white border border-gray-700">
              <motion.div className="flex items-center justify-between" variants={contentVariants}>
                <div className="flex items-center gap-2">
                  <div className="flex flex-col gap-0.5">
                    <div className="h-3 w-6 bg-white rounded-sm"></div>
                    <div className="h-4 w-6 bg-white rounded-sm"></div>
                  </div>
                  <span className="text-xl font-bold lowercase">qubic connect</span>
                </div>
                <IoClose 
                  onClick={() => {
                    setSelectedMode("none");
                    setQrCode("");
                    setConnectionURI("");
                    setAccounts([]);
                    setSelectedAccount(0);
                    onClose();
                  }} 
                  className="h-5 w-5 cursor-pointer hover:opacity-70" 
                />
              </motion.div>

              <AnimatePresence mode="wait">
                {selectedMode === "none" && (
                  <motion.div
                    className="mt-4 flex flex-col gap-4"
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    {connected && (
                      <Button 
                        variant="solid" 
                        className="mt-4" 
                        onClick={async () => {
                          // Disconnect WalletConnect if connected
                          if (isConnected) {
                            try {
                              await walletConnectDisconnect();
                            } catch (error) {
                              console.error("Error disconnecting WalletConnect:", error);
                            }
                          }
                          // Disconnect QubicConnect
                          disconnect();
                          // Reset modal state
                          setSelectedMode("none");
                          setQrCode("");
                          setConnectionURI("");
                          setAccounts([]);
                          setSelectedAccount(0);
                        }}
                      >
                        Disconnect Wallet
                      </Button>
                    )}
                    {!connected && (
                      <>
                        <Button
                          variant="solid"
                          className="mt-4 flex items-center justify-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                          onClick={() => setSelectedMode("metamask")}
                        >
                          <div className="w-8 h-8 flex-shrink-0">
                            <MetaMaskLogo />
                          </div>
                          <span className="font-semibold">MetaMask</span>
                        </Button>
                        <Button
                          variant="solid"
                          className="flex items-center justify-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg"
                          onClick={() => {
                            generateURI();
                            setSelectedMode("walletconnect");
                          }}
                        >
                          <div className="w-8 h-8 flex items-center justify-center flex-shrink-0">
                            <WalletConnectLogo />
                          </div>
                          <span className="font-semibold">Wallet Connect</span>
                        </Button>
                      </>
                    )}
                  </motion.div>
                )}

                {selectedMode === "private-seed" && (
                  <motion.div
                    className="mt-4 space-y-4"
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Your 55 character private key (seed):
                    </p>
                    <Input type="text" value={privateSeed} onChange={(e) => privateKeyValidate(e.target.value)} />
                    {errorMsgPrivateSeed && <p className="text-red-500">{errorMsgPrivateSeed}</p>}
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="bordered" onClick={() => setSelectedMode("none")}>
                        Cancel
                      </Button>
                      <Button
                        variant="solid"
                        onClick={() => {
                          privateKeyConnect(privateSeed);
                          setSelectedMode("none");
                          setPrivateSeed("");
                          onClose();
                        }}
                      >
                        Unlock
                      </Button>
                    </div>
                  </motion.div>
                )}

                {selectedMode === "vault-file" && (
                  <motion.div
                    className="mt-4 space-y-4"
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed">
                      Load your Qubic vault file:
                    </p>
                    <Input type="file" onChange={handleFileChange} />
                    <Input type="password" placeholder="Enter password" onChange={handlePasswordChange} />
                    <div className="grid grid-cols-2 gap-4">
                      <Button variant="bordered" onClick={() => setSelectedMode("none")}>
                        Cancel
                      </Button>
                      <Button
                        variant="solid"
                        onClick={async () => {
                          if (!selectedFile) {
                            alert("Please select a file.");
                            return;
                          }
                          const vault = await vaultFileConnect(selectedFile, password);
                          setAccounts(vault.getSeeds());
                          setSelectedMode("account-select");
                        }}
                      >
                        Unlock
                      </Button>
                    </div>
                  </motion.div>
                )}

                {selectedMode === "account-select" && (
                  <motion.div
                    className="mt-4"
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed mb-4">
                      Select an account:
                    </p>
                    <AccountSelector
                      label={"Account"}
                      options={accounts.map((account, idx) => ({
                        label: account.alias || `Account ${idx + 1}`,
                        value: idx.toString(),
                      }))}
                      selected={selectedAccount}
                      setSelected={(value) => setSelectedAccount(typeof value === 'number' ? value : parseInt(value))}
                    />
                    <div className="mt-4 grid grid-cols-2 gap-4">
                      <Button
                        variant="bordered"
                        className="mt-4"
                        onClick={() => {
                          disconnect();
                          setSelectedMode("none");
                        }}
                      >
                        Lock Wallet
                      </Button>
                      <Button
                        variant="solid"
                        className="mt-4"
                        onClick={() => {
                          connect({
                            connectType: "walletconnect",
                            publicKey: accounts[parseInt(selectedAccount.toString())]?.publicId,
                            alias: accounts[parseInt(selectedAccount.toString())]?.alias,
                          });
                          setSelectedMode("none");
                          onClose();
                        }}
                      >
                        Select Account
                      </Button>
                    </div>
                  </motion.div>
                )}

                {selectedMode === "metamask" && (
                  <motion.div
                    className="mt-4"
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed mb-5">
                      Connect your MetaMask wallet. Please Chekc MetaMask installed and unlocked.
                    </p>
                    <div className="mt-5 flex flex-col gap-2">
                      <HeaderButtons
                        state={state}
                        onConnectClick={() => {
                          mmSnapConnect();
                          setSelectedMode("none");
                          onClose();
                        }}
                      />
                      <Button variant="bordered" className="text-gray-300 border-gray-600 hover:bg-gray-800 hover:text-white" onClick={() => setSelectedMode("none")}>
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}

                {selectedMode === "walletconnect" && (
                  <motion.div
                    className="mt-4"
                    variants={contentVariants}
                    initial="hidden"
                    animate="visible"
                    exit="exit"
                  >
                    <p className="text-sm text-gray-300 leading-relaxed mb-5">
                      Connect your Qubic Wallet. You need to have Qubic Wallet installed and unlocked.
                    </p>
                    <div className="mt-5 flex flex-col gap-4">
                      <div className="flex flex-col items-center justify-center w-full">
                        {qrCode ? (
                          <img 
                            src={qrCode} 
                            alt="Wallet Connect QR Code" 
                            className="w-full max-w-[280px] h-auto mx-auto rounded-lg border-2 border-gray-600 p-2 bg-white" 
                          />
                        ) : (
                          <div className="flex flex-col items-center justify-center py-12">
                            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-gray-600 border-t-blue-500"></div>
                            <p className="text-sm text-gray-400 mt-4">Generating QR code...</p>
                          </div>
                        )}
                      </div>
                      <Button
                        variant="solid"
                        className="flex items-center justify-center gap-3 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
                        onClick={() => window.open(`qubic-wallet://pairwc/${connectionURI}`, "_blank")}
                        disabled={!connectionURI || !qrCode}
                      >
                        Open in Qubic Wallet
                      </Button>
                      <Button 
                        variant="bordered" 
                        className="text-gray-300 border-gray-600 hover:bg-gray-800 hover:text-white" 
                        onClick={() => {
                          setSelectedMode("none");
                          setQrCode("");
                          setConnectionURI("");
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </Card>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default ConnectModal;

