targetScope = 'subscription'

@description('The azd environment name for this separate AKS deployment path.')
param environmentName string

@description('Azure region for the AKS deployment environment.')
param location string

@description('Dedicated resource group name for the AKS deployment path.')
param resourceGroupName string

@description('AKS cluster name. Defaults to a unique name derived from the azd environment.')
param aksClusterName string = 'aks-ci-${uniqueString(subscription().subscriptionId, environmentName)}'

@description('Azure Container Registry name. Must be globally unique and alphanumeric.')
param acrName string = 'acrci${uniqueString(subscription().subscriptionId, environmentName)}'

@description('Azure Database for PostgreSQL Flexible Server name. Must be globally unique.')
param postgresServerName string = 'pg-ci-${uniqueString(subscription().subscriptionId, environmentName)}'

@description('Administrator login for the Azure Database for PostgreSQL Flexible Server.')
param postgresAdministratorLogin string = 'ciadmin'

@secure()
@description('Administrator password for the Azure Database for PostgreSQL Flexible Server.')
param postgresAdministratorPassword string

@description('Application database name.')
param postgresDatabaseName string = 'CustomersDB'

@description('AKS node VM size for the single system pool.')
param aksNodeVmSize string = 'Standard_D2s_v5'

@description('System node count for the dev-tier AKS cluster.')
param aksNodeCount int = 2

@description('Flexible Server SKU for the managed PostgreSQL instance.')
param postgresSkuName string = 'Standard_B1ms'

@description('Managed PostgreSQL major version.')
@allowed([
  '14'
  '15'
  '16'
  '17'
  '18'
])
param postgresVersion string = '18'

var tags = {
  'azd-env-name': environmentName
  'azd-project': 'customer-insights-aks'
  'deployment-path': 'deploy/aks'
}

resource aksResourceGroup 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: resourceGroupName
  location: location
  tags: tags
}

module workload './resources.bicep' = {
  name: 'customerInsightsAksWorkload'
  scope: resourceGroup(resourceGroupName)
  dependsOn: [
    aksResourceGroup
  ]
  params: {
    location: location
    aksClusterName: aksClusterName
    acrName: acrName
    postgresServerName: postgresServerName
    postgresAdministratorLogin: postgresAdministratorLogin
    postgresAdministratorPassword: postgresAdministratorPassword
    postgresDatabaseName: postgresDatabaseName
    aksNodeVmSize: aksNodeVmSize
    aksNodeCount: aksNodeCount
    postgresSkuName: postgresSkuName
    postgresVersion: postgresVersion
    tags: tags
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroupName
output AZURE_AKS_CLUSTER_NAME string = workload.outputs.aksClusterName
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = workload.outputs.acrLoginServer
output ACR_NAME string = workload.outputs.acrName
output AKS_CLUSTER_NAME string = workload.outputs.aksClusterName
output POSTGRES_HOST string = workload.outputs.postgresHost
output POSTGRES_PORT string = '5432'
output POSTGRES_DATABASE string = workload.outputs.postgresDatabaseName
output POSTGRES_ADMIN_USERNAME string = postgresAdministratorLogin
output POSTGRES_SERVER_NAME string = workload.outputs.postgresServerName
