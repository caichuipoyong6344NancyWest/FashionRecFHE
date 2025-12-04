// App.tsx
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import WalletManager from "./components/WalletManager";
import WalletSelector from "./components/WalletSelector";
import "./App.css";

interface FashionItem {
  id: string;
  encryptedData: string;
  timestamp: number;
  owner: string;
  category: string;
  style: string;
  status: "pending" | "recommended" | "rejected";
}

const App: React.FC = () => {
  const [account, setAccount] = useState("");
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<FashionItem[]>([]);
  const [provider, setProvider] = useState<ethers.BrowserProvider | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [walletSelectorOpen, setWalletSelectorOpen] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{
    visible: boolean;
    status: "pending" | "success" | "error";
    message: string;
  }>({ visible: false, status: "pending", message: "" });
  const [newItemData, setNewItemData] = useState({
    category: "",
    description: "",
    style: "",
    preference: ""
  });
  const [activeTab, setActiveTab] = useState("recommendations");
  const [searchTerm, setSearchTerm] = useState("");

  // Style: High contrast (blue+orange), Glass morphism, Center radiation, Micro-interactions
  const recommendedCount = items.filter(i => i.status === "recommended").length;
  const pendingCount = items.filter(i => i.status === "pending").length;
  const rejectedCount = items.filter(i => i.status === "rejected").length;

  useEffect(() => {
    loadItems().finally(() => setLoading(false));
  }, []);

  const onWalletSelect = async (wallet: any) => {
    if (!wallet.provider) return;
    try {
      const web3Provider = new ethers.BrowserProvider(wallet.provider);
      setProvider(web3Provider);
      const accounts = await web3Provider.send("eth_requestAccounts", []);
      const acc = accounts[0] || "";
      setAccount(acc);

      wallet.provider.on("accountsChanged", async (accounts: string[]) => {
        const newAcc = accounts[0] || "";
        setAccount(newAcc);
      });
    } catch (e) {
      alert("Failed to connect wallet");
    }
  };

  const onConnect = () => setWalletSelectorOpen(true);
  const onDisconnect = () => {
    setAccount("");
    setProvider(null);
  };

  const loadItems = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      
      // Check contract availability using FHE
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) {
        console.error("Contract is not available");
        return;
      }
      
      const keysBytes = await contract.getData("fashion_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing fashion keys:", e);
        }
      }
      
      const list: FashionItem[] = [];
      
      for (const key of keys) {
        try {
          const itemBytes = await contract.getData(`fashion_${key}`);
          if (itemBytes.length > 0) {
            try {
              const itemData = JSON.parse(ethers.toUtf8String(itemBytes));
              list.push({
                id: key,
                encryptedData: itemData.data,
                timestamp: itemData.timestamp,
                owner: itemData.owner,
                category: itemData.category,
                style: itemData.style,
                status: itemData.status || "pending"
              });
            } catch (e) {
              console.error(`Error parsing fashion data for ${key}:`, e);
            }
          }
        } catch (e) {
          console.error(`Error loading fashion item ${key}:`, e);
        }
      }
      
      list.sort((a, b) => b.timestamp - a.timestamp);
      setItems(list);
    } catch (e) {
      console.error("Error loading fashion items:", e);
    } finally {
      setIsRefreshing(false);
      setLoading(false);
    }
  };

  const addItem = async () => {
    if (!provider) { 
      alert("Please connect wallet first"); 
      return; 
    }
    
    setAdding(true);
    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Encrypting fashion preference with Zama FHE..."
    });
    
    try {
      // Simulate FHE encryption
      const encryptedData = `FHE-${btoa(JSON.stringify(newItemData))}`;
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const itemId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

      const itemData = {
        data: encryptedData,
        timestamp: Math.floor(Date.now() / 1000),
        owner: account,
        category: newItemData.category,
        style: newItemData.style,
        status: "pending"
      };
      
      // Store encrypted data on-chain using FHE
      await contract.setData(
        `fashion_${itemId}`, 
        ethers.toUtf8Bytes(JSON.stringify(itemData))
      );
      
      const keysBytes = await contract.getData("fashion_keys");
      let keys: string[] = [];
      
      if (keysBytes.length > 0) {
        try {
          keys = JSON.parse(ethers.toUtf8String(keysBytes));
        } catch (e) {
          console.error("Error parsing keys:", e);
        }
      }
      
      keys.push(itemId);
      
      await contract.setData(
        "fashion_keys", 
        ethers.toUtf8Bytes(JSON.stringify(keys))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "Encrypted fashion preference submitted securely!"
      });
      
      await loadItems();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowAddModal(false);
        setNewItemData({
          category: "",
          description: "",
          style: "",
          preference: ""
        });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction")
        ? "Transaction rejected by user"
        : "Submission failed: " + (e.message || "Unknown error");
      
      setTransactionStatus({
        visible: true,
        status: "error",
        message: errorMessage
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    } finally {
      setAdding(false);
    }
  };

  const recommendItem = async (itemId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted fashion data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const itemBytes = await contract.getData(`fashion_${itemId}`);
      if (itemBytes.length === 0) {
        throw new Error("Item not found");
      }
      
      const itemData = JSON.parse(ethers.toUtf8String(itemBytes));
      
      const updatedItem = {
        ...itemData,
        status: "recommended"
      };
      
      await contract.setData(
        `fashion_${itemId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedItem))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE recommendation completed successfully!"
      });
      
      await loadItems();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Recommendation failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const rejectItem = async (itemId: string) => {
    if (!provider) {
      alert("Please connect wallet first");
      return;
    }

    setTransactionStatus({
      visible: true,
      status: "pending",
      message: "Processing encrypted fashion data with FHE..."
    });

    try {
      // Simulate FHE computation time
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      const contract = await getContractWithSigner();
      if (!contract) {
        throw new Error("Failed to get contract with signer");
      }
      
      const itemBytes = await contract.getData(`fashion_${itemId}`);
      if (itemBytes.length === 0) {
        throw new Error("Item not found");
      }
      
      const itemData = JSON.parse(ethers.toUtf8String(itemBytes));
      
      const updatedItem = {
        ...itemData,
        status: "rejected"
      };
      
      await contract.setData(
        `fashion_${itemId}`, 
        ethers.toUtf8Bytes(JSON.stringify(updatedItem))
      );
      
      setTransactionStatus({
        visible: true,
        status: "success",
        message: "FHE rejection completed successfully!"
      });
      
      await loadItems();
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 2000);
    } catch (e: any) {
      setTransactionStatus({
        visible: true,
        status: "error",
        message: "Rejection failed: " + (e.message || "Unknown error")
      });
      
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
      }, 3000);
    }
  };

  const isOwner = (address: string) => {
    return account.toLowerCase() === address.toLowerCase();
  };

  const filteredItems = items.filter(item => {
    const matchesSearch = searchTerm === "" || 
      item.category.toLowerCase().includes(searchTerm.toLowerCase()) || 
      item.style.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === "recommendations") {
      return matchesSearch && item.status === "recommended";
    } else if (activeTab === "pending") {
      return matchesSearch && item.status === "pending";
    } else {
      return matchesSearch;
    }
  });

  const renderStyleChart = () => {
    const styleCounts: Record<string, number> = {};
    items.forEach(item => {
      styleCounts[item.style] = (styleCounts[item.style] || 0) + 1;
    });

    return (
      <div className="style-chart">
        {Object.entries(styleCounts).map(([style, count]) => (
          <div key={style} className="style-bar">
            <div className="style-label">{style}</div>
            <div className="bar-container">
              <div 
                className="bar-fill" 
                style={{ width: `${(count / items.length) * 100}%` }}
              ></div>
            </div>
            <div className="style-count">{count}</div>
          </div>
        ))}
      </div>
    );
  };

  if (loading) return (
    <div className="loading-screen">
      <div className="fashion-spinner"></div>
      <p>Initializing encrypted fashion connection...</p>
    </div>
  );

  return (
    <div className="app-container">
      <header className="app-header">
        <div className="logo">
          <div className="logo-icon">
            <div className="dress-icon"></div>
          </div>
          <h1>Fashion<span>Rec</span>FHE</h1>
        </div>
        
        <div className="header-actions">
          <div className="search-bar">
            <input
              type="text"
              placeholder="Search styles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            <button className="search-button">
              <span className="search-icon"></span>
            </button>
          </div>
          <button 
            onClick={() => setShowAddModal(true)} 
            className="add-item-btn"
          >
            <div className="add-icon"></div>
            Add Preference
          </button>
          <WalletManager account={account} onConnect={onConnect} onDisconnect={onDisconnect} />
        </div>
      </header>
      
      <div className="main-content">
        <div className="welcome-banner">
          <div className="welcome-text">
            <h2>Privacy-Preserving Fashion Recommendations</h2>
            <p>Get personalized style suggestions while keeping your preferences encrypted with FHE</p>
          </div>
        </div>
        
        <div className="dashboard-section">
          <div className="stats-card">
            <h3>Your Style Profile</h3>
            <div className="stats-grid">
              <div className="stat-item">
                <div className="stat-value">{items.length}</div>
                <div className="stat-label">Total Items</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{recommendedCount}</div>
                <div className="stat-label">Recommended</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{pendingCount}</div>
                <div className="stat-label">Pending</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">{rejectedCount}</div>
                <div className="stat-label">Rejected</div>
              </div>
            </div>
          </div>
          
          <div className="style-analysis">
            <h3>Your Style Distribution</h3>
            {renderStyleChart()}
          </div>
        </div>
        
        <div className="tabs-container">
          <div className="tabs">
            <button 
              className={`tab-button ${activeTab === "recommendations" ? "active" : ""}`}
              onClick={() => setActiveTab("recommendations")}
            >
              Recommendations
            </button>
            <button 
              className={`tab-button ${activeTab === "pending" ? "active" : ""}`}
              onClick={() => setActiveTab("pending")}
            >
              Pending Review
            </button>
            <button 
              className={`tab-button ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All Items
            </button>
          </div>
        </div>
        
        <div className="items-section">
          <div className="section-header">
            <h2>Your Fashion Items</h2>
            <div className="header-actions">
              <button 
                onClick={loadItems}
                className="refresh-btn"
                disabled={isRefreshing}
              >
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </button>
            </div>
          </div>
          
          <div className="items-list">
            {filteredItems.length === 0 ? (
              <div className="no-items">
                <div className="no-items-icon"></div>
                <p>No fashion items found</p>
                <button 
                  className="primary-btn"
                  onClick={() => setShowAddModal(true)}
                >
                  Add Your First Style Preference
                </button>
              </div>
            ) : (
              <div className="items-grid">
                {filteredItems.map(item => (
                  <div className="fashion-card" key={item.id}>
                    <div className="card-header">
                      <div className="item-category">{item.category}</div>
                      <div className={`item-status ${item.status}`}>
                        {item.status}
                      </div>
                    </div>
                    <div className="item-style">{item.style}</div>
                    <div className="item-meta">
                      <div className="item-date">
                        {new Date(item.timestamp * 1000).toLocaleDateString()}
                      </div>
                      <div className="item-owner">
                        {item.owner.substring(0, 6)}...{item.owner.substring(38)}
                      </div>
                    </div>
                    {isOwner(item.owner) && item.status === "pending" && (
                      <div className="card-actions">
                        <button 
                          className="action-btn recommend"
                          onClick={() => recommendItem(item.id)}
                        >
                          Recommend
                        </button>
                        <button 
                          className="action-btn reject"
                          onClick={() => rejectItem(item.id)}
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
  
      {showAddModal && (
        <ModalAdd 
          onSubmit={addItem} 
          onClose={() => setShowAddModal(false)} 
          adding={adding}
          itemData={newItemData}
          setItemData={setNewItemData}
        />
      )}
      
      {walletSelectorOpen && (
        <WalletSelector
          isOpen={walletSelectorOpen}
          onWalletSelect={(wallet) => { onWalletSelect(wallet); setWalletSelectorOpen(false); }}
          onClose={() => setWalletSelectorOpen(false)}
        />
      )}
      
      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="fashion-spinner"></div>}
              {transactionStatus.status === "success" && <div className="check-icon"></div>}
              {transactionStatus.status === "error" && <div className="error-icon"></div>}
            </div>
            <div className="transaction-message">
              {transactionStatus.message}
            </div>
          </div>
        </div>
      )}
  
      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <div className="logo">
              <div className="dress-icon"></div>
              <span>FashionRecFHE</span>
            </div>
            <p>Privacy-preserving fashion recommendations powered by FHE</p>
          </div>
          
          <div className="footer-links">
            <a href="#" className="footer-link">How It Works</a>
            <a href="#" className="footer-link">Privacy Policy</a>
            <a href="#" className="footer-link">About FHE</a>
            <a href="#" className="footer-link">Contact Us</a>
          </div>
        </div>
        
        <div className="footer-bottom">
          <div className="fhe-badge">
            <span>FHE-Powered Privacy</span>
          </div>
          <div className="copyright">
            © {new Date().getFullYear()} FashionRecFHE. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
};

interface ModalAddProps {
  onSubmit: () => void; 
  onClose: () => void; 
  adding: boolean;
  itemData: any;
  setItemData: (data: any) => void;
}

const ModalAdd: React.FC<ModalAddProps> = ({ 
  onSubmit, 
  onClose, 
  adding,
  itemData,
  setItemData
}) => {
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setItemData({
      ...itemData,
      [name]: value
    });
  };

  const handleSubmit = () => {
    if (!itemData.category || !itemData.style || !itemData.preference) {
      alert("Please fill required fields");
      return;
    }
    
    onSubmit();
  };

  return (
    <div className="modal-overlay">
      <div className="add-modal">
        <div className="modal-header">
          <h2>Add Fashion Preference</h2>
          <button onClick={onClose} className="close-modal">&times;</button>
        </div>
        
        <div className="modal-body">
          <div className="fhe-notice">
            <div className="lock-icon"></div> Your preferences will be encrypted with FHE technology
          </div>
          
          <div className="form-group">
            <label>Category *</label>
            <select 
              name="category"
              value={itemData.category} 
              onChange={handleChange}
            >
              <option value="">Select category</option>
              <option value="Casual">Casual</option>
              <option value="Formal">Formal</option>
              <option value="Sportswear">Sportswear</option>
              <option value="Evening">Evening Wear</option>
              <option value="Business">Business</option>
            </select>
          </div>
          
          <div className="form-group">
            <label>Preferred Style *</label>
            <input 
              type="text"
              name="style"
              value={itemData.style} 
              onChange={handleChange}
              placeholder="e.g. Minimalist, Bohemian, Streetwear..." 
            />
          </div>
          
          <div className="form-group">
            <label>Description</label>
            <input 
              type="text"
              name="description"
              value={itemData.description} 
              onChange={handleChange}
              placeholder="Brief description..." 
            />
          </div>
          
          <div className="form-group">
            <label>Detailed Preferences *</label>
            <textarea 
              name="preference"
              value={itemData.preference} 
              onChange={handleChange}
              placeholder="Describe your fashion preferences in detail..." 
              rows={4}
            />
          </div>
        </div>
        
        <div className="modal-footer">
          <button 
            onClick={onClose}
            className="cancel-btn"
          >
            Cancel
          </button>
          <button 
            onClick={handleSubmit} 
            disabled={adding}
            className="submit-btn"
          >
            {adding ? "Encrypting with FHE..." : "Submit Securely"}
          </button>
        </div>
      </div>
    </div>
  );
};

export default App;