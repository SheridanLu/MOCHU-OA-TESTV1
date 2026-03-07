import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import api from '../services/api';

// 权限上下文
const PermissionContext = createContext({
  permissions: [],
  roles: [],
  isLoading: true,
  hasPermission: () => false,
  hasAnyPermission: () => false,
  hasAllPermissions: () => false,
  refreshPermissions: async () => {},
});

/**
 * 权限提供者组件
 * 在应用根组件中使用，提供全局权限状态
 */
export function PermissionProvider({ children }) {
  const [permissions, setPermissions] = useState([]);
  const [roles, setRoles] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // 获取用户权限
  const fetchPermissions = useCallback(async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setPermissions([]);
      setRoles([]);
      setIsLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/permissions');
      if (response.data.success) {
        setPermissions(response.data.permissions || []);
        setRoles(response.data.roles || []);
      }
    } catch (error) {
      console.error('获取权限失败:', error);
      setPermissions([]);
      setRoles([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPermissions();
  }, [fetchPermissions]);

  // 检查单个权限
  const hasPermission = useCallback((permission) => {
    // 超级管理员拥有所有权限
    if (permissions.includes('*')) {
      return true;
    }
    return permissions.includes(permission);
  }, [permissions]);

  // 检查是否有任意一个权限
  const hasAnyPermission = useCallback((permissionList) => {
    // 超级管理员拥有所有权限
    if (permissions.includes('*')) {
      return true;
    }
    return permissionList.some(perm => permissions.includes(perm));
  }, [permissions]);

  // 检查是否有所有权限
  const hasAllPermissions = useCallback((permissionList) => {
    // 超级管理员拥有所有权限
    if (permissions.includes('*')) {
      return true;
    }
    return permissionList.every(perm => permissions.includes(perm));
  }, [permissions]);

  const value = {
    permissions,
    roles,
    isLoading,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    refreshPermissions: fetchPermissions,
  };

  return (
    <PermissionContext.Provider value={value}>
      {children}
    </PermissionContext.Provider>
  );
}

/**
 * 使用权限的 Hook
 */
export function usePermission() {
  const context = useContext(PermissionContext);
  if (!context) {
    throw new Error('usePermission 必须在 PermissionProvider 内使用');
  }
  return context;
}

/**
 * 权限检查组件
 * 根据权限显示或隐藏子组件
 * 
 * @example
 * <Permission required="project:create">
 *   <button>创建项目</button>
 * </Permission>
 * 
 * @example
 * <Permission any={['contract:approve', 'finance']}>
 *   <button>审批合同</button>
 * </Permission>
 */
export function Permission({ required, any, all, children, fallback = null }) {
  const { hasPermission, hasAnyPermission, hasAllPermissions } = usePermission();

  // 检查单个权限
  if (required) {
    if (!hasPermission(required)) {
      return fallback;
    }
    return children;
  }

  // 检查任意一个权限
  if (any && any.length > 0) {
    if (!hasAnyPermission(any)) {
      return fallback;
    }
    return children;
  }

  // 检查所有权限
  if (all && all.length > 0) {
    if (!hasAllPermissions(all)) {
      return fallback;
    }
    return children;
  }

  return children;
}

/**
 * 高阶组件：为组件添加权限检查
 * 
 * @example
 * const ProtectedButton = withPermission('project:create')(<button>创建项目</button>);
 */
export function withPermission(permission) {
  return (Component) => {
    return function WrappedComponent(props) {
      const { hasPermission } = usePermission();
      
      if (!hasPermission(permission)) {
        return null;
      }
      
      return <Component {...props} />;
    };
  };
}

/**
 * 快捷检查函数（不依赖 Context，用于非组件场景）
 * 需要先确保权限数据已加载到 localStorage 或全局状态
 */
export function checkPermission(permission) {
  const storedPermissions = localStorage.getItem('userPermissions');
  if (!storedPermissions) {
    return false;
  }
  
  try {
    const permissions = JSON.parse(storedPermissions);
    if (permissions.includes('*')) {
      return true;
    }
    return permissions.includes(permission);
  } catch {
    return false;
  }
}

export function checkAnyPermission(permissionList) {
  const storedPermissions = localStorage.getItem('userPermissions');
  if (!storedPermissions) {
    return false;
  }
  
  try {
    const permissions = JSON.parse(storedPermissions);
    if (permissions.includes('*')) {
      return true;
    }
    return permissionList.some(perm => permissions.includes(perm));
  } catch {
    return false;
  }
}

export function checkAllPermissions(permissionList) {
  const storedPermissions = localStorage.getItem('userPermissions');
  if (!storedPermissions) {
    return false;
  }
  
  try {
    const permissions = JSON.parse(storedPermissions);
    if (permissions.includes('*')) {
      return true;
    }
    return permissionList.every(perm => permissions.includes(perm));
  } catch {
    return false;
  }
}

// 默认导出
export default {
  PermissionProvider,
  usePermission,
  Permission,
  withPermission,
  checkPermission,
  checkAnyPermission,
  checkAllPermissions,
};
