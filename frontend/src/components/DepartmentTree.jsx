import { useState, useEffect, useMemo } from 'react';
import { Tree, Input, Card, Descriptions, Empty, Spin, message, Button, Space } from 'antd';
import { SearchOutlined, ReloadOutlined, UserOutlined, TeamOutlined } from '@ant-design/icons';
import { getDepartmentTree, getDepartmentById } from '../services/department';

const { Search } = Input;

/**
 * 部门树组件
 * 支持展开/收起、搜索过滤、点击显示详情
 */
function DepartmentTree() {
  const [treeData, setTreeData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [selectedDepartment, setSelectedDepartment] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState([]);

  // 加载部门树数据
  const loadTreeData = async () => {
    setLoading(true);
    try {
      const result = await getDepartmentTree();
      if (result.success) {
        setTreeData(result.data);
        // 默认展开所有节点
        const allKeys = getAllKeys(result.data);
        setExpandedKeys(allKeys);
      } else {
        message.error(result.message || '加载部门树失败');
      }
    } catch (error) {
      console.error('加载部门树失败:', error);
      message.error('加载部门树失败');
    } finally {
      setLoading(false);
    }
  };

  // 获取所有节点的 key（用于默认展开）
  const getAllKeys = (data, keys = []) => {
    data.forEach(item => {
      keys.push(item.key);
      if (item.children && item.children.length > 0) {
        getAllKeys(item.children, keys);
      }
    });
    return keys;
  };

  useEffect(() => {
    loadTreeData();
  }, []);

  // 处理节点点击 - 获取部门详情
  const handleSelect = async (selectedKeys, info) => {
    if (selectedKeys.length === 0) return;
    
    const departmentId = selectedKeys[0];
    setDetailLoading(true);
    
    try {
      const result = await getDepartmentById(departmentId);
      if (result.success) {
        setSelectedDepartment(result.data);
      } else {
        message.error(result.message || '获取部门详情失败');
      }
    } catch (error) {
      console.error('获取部门详情失败:', error);
      message.error('获取部门详情失败');
    } finally {
      setDetailLoading(false);
    }
  };

  // 处理展开/收起
  const handleExpand = (expandedKeys) => {
    setExpandedKeys(expandedKeys);
  };

  // 搜索过滤部门树
  const filterTreeData = useMemo(() => {
    if (!searchValue.trim()) {
      return treeData;
    }

    const filterNodes = (nodes, keyword) => {
      return nodes.reduce((acc, node) => {
        const title = node.title || '';
        const isMatch = title.toLowerCase().includes(keyword.toLowerCase());
        
        // 递归处理子节点
        const filteredChildren = node.children ? filterNodes(node.children, keyword) : [];
        
        if (isMatch || filteredChildren.length > 0) {
          acc.push({
            ...node,
            children: filteredChildren
          });
          
          // 如果匹配，将父节点加入展开列表
          if (isMatch && !expandedKeys.includes(node.key)) {
            setExpandedKeys(prev => [...prev, node.key]);
          }
        }
        
        return acc;
      }, []);
    };

    return filterNodes(treeData, searchValue);
  }, [treeData, searchValue]);

  // 处理搜索
  const handleSearch = (value) => {
    setSearchValue(value);
    
    // 如果有搜索值，展开所有匹配的节点
    if (value.trim()) {
      const matchedKeys = getMatchedKeys(treeData, value);
      setExpandedKeys(matchedKeys);
    }
  };

  // 获取匹配的节点及其父节点的 keys
  const getMatchedKeys = (nodes, keyword, parentKeys = [], matchedSet = new Set()) => {
    nodes.forEach(node => {
      const title = node.title || '';
      const isMatch = title.toLowerCase().includes(keyword.toLowerCase());
      
      if (isMatch) {
        // 将当前节点和所有父节点加入展开列表
        matchedSet.add(node.key);
        parentKeys.forEach(key => matchedSet.add(key));
      }
      
      if (node.children && node.children.length > 0) {
        getMatchedKeys(node.children, keyword, [...parentKeys, node.key], matchedSet);
      }
    });
    
    return Array.from(matchedSet);
  };

  // 自定义树节点标题（高亮搜索词）
  const titleRender = (nodeData) => {
    const title = nodeData.title || '';
    
    if (!searchValue.trim()) {
      return (
        <span>
          <TeamOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          {title}
        </span>
      );
    }
    
    const index = title.toLowerCase().indexOf(searchValue.toLowerCase());
    if (index === -1) {
      return (
        <span>
          <TeamOutlined style={{ marginRight: 8, color: '#1890ff' }} />
          {title}
        </span>
      );
    }
    
    const beforeStr = title.substring(0, index);
    const matchStr = title.substring(index, index + searchValue.length);
    const afterStr = title.substring(index + searchValue.length);
    
    return (
      <span>
        <TeamOutlined style={{ marginRight: 8, color: '#1890ff' }} />
        {beforeStr}
        <span style={{ color: '#f50' }}>{matchStr}</span>
        {afterStr}
      </span>
    );
  };

  return (
    <div style={{ display: 'flex', gap: 16, height: '100%' }}>
      {/* 左侧：部门树 */}
      <Card 
        title="部门架构" 
        style={{ width: 350, flexShrink: 0 }}
        extra={
          <Button 
            type="text" 
            icon={<ReloadOutlined />} 
            onClick={loadTreeData}
            loading={loading}
          />
        }
      >
        <Space direction="vertical" style={{ width: '100%', marginBottom: 16 }}>
          <Search
            placeholder="搜索部门..."
            allowClear
            onSearch={handleSearch}
            onChange={(e) => handleSearch(e.target.value)}
            prefix={<SearchOutlined />}
          />
        </Space>
        
        <Spin spinning={loading}>
          {filterTreeData.length > 0 ? (
            <Tree
              showLine
              showIcon={false}
              treeData={filterTreeData}
              selectedKeys={selectedDepartment ? [String(selectedDepartment.id)] : []}
              expandedKeys={expandedKeys}
              onSelect={handleSelect}
              onExpand={handleExpand}
              titleRender={titleRender}
              style={{ marginTop: 8 }}
            />
          ) : (
            <Empty 
              description={searchValue ? '未找到匹配的部门' : '暂无部门数据'} 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Spin>
      </Card>
      
      {/* 右侧：部门详情 */}
      <Card 
        title="部门详情" 
        style={{ flex: 1 }}
      >
        <Spin spinning={detailLoading}>
          {selectedDepartment ? (
            <Descriptions 
              bordered 
              column={2}
              labelStyle={{ width: 120 }}
            >
              <Descriptions.Item label="部门名称" span={2}>
                {selectedDepartment.name}
              </Descriptions.Item>
              <Descriptions.Item label="上级部门">
                {selectedDepartment.parent_name || '（顶级部门）'}
              </Descriptions.Item>
              <Descriptions.Item label="排序">
                {selectedDepartment.sort_order || 0}
              </Descriptions.Item>
              <Descriptions.Item label="部门负责人">
                {selectedDepartment.manager_name ? (
                  <span>
                    <UserOutlined style={{ marginRight: 8, color: '#52c41a' }} />
                    {selectedDepartment.manager_name}
                  </span>
                ) : '未设置'}
              </Descriptions.Item>
              <Descriptions.Item label="人员数量">
                <span style={{ color: '#1890ff', fontWeight: 'bold' }}>
                  {selectedDepartment.user_count || 0} 人
                </span>
              </Descriptions.Item>
              <Descriptions.Item label="创建时间" span={2}>
                {selectedDepartment.created_at 
                  ? new Date(selectedDepartment.created_at).toLocaleString('zh-CN')
                  : '-'}
              </Descriptions.Item>
            </Descriptions>
          ) : (
            <Empty 
              description="请从左侧选择一个部门查看详情" 
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
}

export default DepartmentTree;
