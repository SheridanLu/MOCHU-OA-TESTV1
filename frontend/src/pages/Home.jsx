import { useNavigate } from 'react-router-dom';
import { getCurrentUser, logout } from '../services/auth';
import './Home.css';

function Home() {
  const navigate = useNavigate();
  const user = getCurrentUser();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="home-container">
      <header className="home-header">
        <h1>OA 办公系统</h1>
        <div className="user-info">
          <span>欢迎，{user?.realName || user?.username || '用户'}</span>
          <button onClick={handleLogout} className="logout-button">
            退出登录
          </button>
        </div>
      </header>
      
      <main className="home-main">
        <div className="welcome-card">
          <h2>欢迎使用 OA 办公系统</h2>
          <p>系统功能模块正在开发中...</p>
        </div>
      </main>
    </div>
  );
}

export default Home;
