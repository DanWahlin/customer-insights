targetScope = 'subscription'

@description('Short azd environment name used to identify the deployment.')
@minLength(1)
param environmentName string

@description('Azure region for the resource group and all Azure AI resources.')
param location string = deployment().location

@description('Resource group that contains the Azure dependencies for the local application.')
param resourceGroupName string

@description('Globally unique Azure AI Services account name.')
@minLength(2)
@maxLength(64)
param aiAccountName string

@description('Foundry project name within the Azure AI Services account.')
@minLength(2)
@maxLength(64)
param aiProjectName string

@description('Globally unique Azure AI Search service name.')
@minLength(2)
@maxLength(60)
param searchServiceName string

@description('GPT model deployment name.')
param aiModelDeploymentName string = 'gpt-5-mini'

@description('GPT model version available in the selected region.')
param aiModelVersion string = '2025-08-07'

@description('Embedding model deployment name.')
param embeddingModelDeploymentName string = 'text-embedding-3-small'

@description('Embedding model version available in the selected region.')
param embeddingModelVersion string = '1'

@description('Global Standard capacity for the GPT deployment. This is throughput quota, not reserved capacity.')
@minValue(1)
param aiModelCapacity int = 10

@description('Global Standard capacity for the embedding deployment. This is throughput quota, not reserved capacity.')
@minValue(1)
param embeddingModelCapacity int = 120

resource resourceGroup 'Microsoft.Resources/resourceGroups@2025-04-01' = {
  name: resourceGroupName
  location: location
  tags: {
    'managed-by': 'azd'
    project: 'openai-acs-msgraph'
    purpose: 'talk-demo'
  }
}

module azureDependencies './resources.bicep' = {
  name: 'azure-dependencies-${uniqueString(resourceGroup.id, environmentName)}'
  scope: resourceGroup
  params: {
    location: location
    aiAccountName: aiAccountName
    aiProjectName: aiProjectName
    searchServiceName: searchServiceName
    aiModelDeploymentName: aiModelDeploymentName
    aiModelVersion: aiModelVersion
    embeddingModelDeploymentName: embeddingModelDeploymentName
    embeddingModelVersion: embeddingModelVersion
    aiModelCapacity: aiModelCapacity
    embeddingModelCapacity: embeddingModelCapacity
  }
}

output AZURE_RESOURCE_GROUP string = resourceGroup.name
output AZURE_LOCATION string = location
output AI_ACCOUNT_NAME string = azureDependencies.outputs.aiAccountName
output AI_PROJECT_NAME string = azureDependencies.outputs.aiProjectName
output AI_ENDPOINT string = azureDependencies.outputs.aiEndpoint
output AI_MODEL string = aiModelDeploymentName
output AI_EMBEDDING_MODEL string = embeddingModelDeploymentName
output AZURE_AI_SEARCH_SERVICE_NAME string = azureDependencies.outputs.searchServiceName
output AZURE_AI_SEARCH_ENDPOINT string = azureDependencies.outputs.searchEndpoint
